import { lstat, realpath, rm } from 'node:fs/promises';
import { isAbsolute, parse, posix, relative, resolve } from 'node:path';

export const cleanupPaths = Object.freeze(['data', 'backups', 'secrets', '.download.env', '.env']);
async function noSymlinks(root, local) {
  let cursor = root;
  for (const part of local.split(/[\\/]/)) {
    cursor = resolve(cursor, part);
    const info = await lstat(cursor).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (info?.isSymbolicLink()) throw new Error(`清理目标 ${local} 是符号链接，请先处理挂载或链接`);
  }
}
async function checkedPaths(root) {
  root = await realpath(root);
  if (root === parse(root).root) throw new Error('不能在文件系统根目录执行数据清理');
  const paths = cleanupPaths.map(name => resolve(root, name));
  for (const path of paths) {
    const local = relative(root, path);
    if (!local || local.startsWith('..') || isAbsolute(local)) throw new Error('数据清理路径超出项目目录');
    await noSymlinks(root, local);
  }
  return paths;
}
export async function cleanupPlan(root, configuration, project, hostRoot) {
  root = await realpath(root);
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project) || configuration.name !== project) throw new Error('Compose 部署名称与当前配置不一致');
  if (!posix.isAbsolute(hostRoot) || hostRoot === '/' || posix.normalize(hostRoot) !== hostRoot || /[\r\n\0]/.test(hostRoot)) throw new Error('项目目录不适合执行数据清理');
  const volumes = [];
  for (const volume of Object.values(configuration.volumes ?? {})) {
    if (volume.external) throw new Error('彻底卸载不支持外部数据卷，请先手动确认外部数据的归属');
    if (typeof volume.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(volume.name)) throw new Error('无法确定 Compose 数据卷名称');
    volumes.push(volume.name);
  }
  for (const service of Object.values(configuration.services ?? {})) for (const mount of service.volumes ?? []) {
    if (mount.type === 'volume') {
      if (!mount.source || !Object.hasOwn(configuration.volumes ?? {}, mount.source)) throw new Error('无法确定数据卷归属');
    } else if (mount.type === 'bind') {
      if (typeof mount.source !== 'string' || !posix.isAbsolute(mount.source)) throw new Error('无法确定宿主机数据路径');
      const local = posix.relative(hostRoot, mount.source);
      const managed = cleanupPaths.some(name => local === name || local.startsWith(name + '/'));
      const gatewayConfig = local === 'deploy/nginx.conf' && mount.target === '/etc/nginx/conf.d/default.conf';
      if (!local || local.startsWith('../') || posix.isAbsolute(local) || (!managed && !gatewayConfig)) throw new Error('存在清理范围之外的宿主机挂载，请先手动确认数据位置');
      await noSymlinks(root, local);
    } else if (mount.type !== 'tmpfs') throw new Error('存在无法识别的 Compose 挂载');
  }
  if (Object.keys(configuration.configs ?? {}).length || Object.keys(configuration.secrets ?? {}).length) throw new Error('自定义 Compose configs/secrets 请先手动确认文件位置');
  await checkedPaths(root);
  return { volumes: [...new Set(volumes)].sort(), paths: [...cleanupPaths] };
}
export async function removeProjectData(root) {
  // Validate every target before removing any file. Recursive rm removes child symlinks without following them.
  const paths = await checkedPaths(root);
  for (const path of paths) await rm(path, { recursive: true, force: true });
}
