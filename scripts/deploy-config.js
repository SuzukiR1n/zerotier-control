// Runs in the Web image: the server needs Docker, not a host Node.js installation.
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { chmod, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPasswordHash, passwordHash } from '../server/account.js';
import { cleanupPlan, removeProjectData } from './deploy-cleanup.js';

const keys = ['COMPOSE_PROJECT_NAME', 'PLANET_ENDPOINTS', 'ZT_PORT', 'WEB_PORT', 'WEB_BIND_ADDRESS', 'ADMIN_PASSWORD_PATH', 'PUBLIC_ORIGIN', 'COOKIE_SECURE'];
function port(value, name) {
  if (!/^[1-9]\d{0,4}$/.test(String(value)) || Number(value) > 65535) throw new Error(`${name} 必须为 1–65535`);
  return String(value);
}
function address(value) {
  const kind = isIP(value);
  if (!kind || value.includes('%') || (kind === 4 && (value === '0.0.0.0' || (Number(value.split('.')[0]) >= 224 && Number(value.split('.')[0]) <= 239))) || (kind === 6 && (/^ff/i.test(value) || new URL(`http://[${value}]`).hostname === '[::]'))) {
    throw new Error('请输入有效的 IPv4 / IPv6 地址，不能使用域名、全零地址或多播地址');
  }
  return value;
}
export function detectedAddress(value, family) {
  value = String(value).trim();
  const kind = isIP(value);
  if (kind !== Number(family)) throw new Error('检测结果不是指定类型的 IP 地址');
  if (kind === 4) {
    const [a, b, c] = value.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)) throw new Error('检测结果不是公网地址');
  } else {
    const normalized = new URL(`http://[${value}]`).hostname.slice(1, -1);
    if (!/^[23][0-9a-f]{3}:/i.test(normalized) || /^2001:db8:/i.test(normalized)) throw new Error('检测结果不是公网地址');
  }
  return value;
}
export function validateConfig(input) {
  const config = { COMPOSE_PROJECT_NAME: 'zerotier-control', ZT_PORT: '9993', WEB_PORT: '3443', WEB_BIND_ADDRESS: '127.0.0.1', ADMIN_PASSWORD_PATH: './secrets/admin-password', COOKIE_SECURE: 'false', ...input };
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(config.COMPOSE_PROJECT_NAME)) throw new Error('部署名称只能包含小写字母、数字、下划线和连字符');
  config.ZT_PORT = port(config.ZT_PORT, 'ZeroTier 端口');
  config.WEB_PORT = port(config.WEB_PORT, 'Web 端口');
  const endpoints = String(config.PLANET_ENDPOINTS || '').split(',').map(item => {
    const match = item.trim().match(/^(.+)\/([^/]+)$/);
    if (!match) throw new Error('Planet 地址格式为 IP/端口');
    return `${address(match[1])}/${port(match[2], 'Planet 端口')}`;
  });
  if (endpoints.length > 32) throw new Error('Planet 最多允许 32 个地址');
  config.PLANET_ENDPOINTS = [...new Set(endpoints)].join(',');
  if (!['127.0.0.1', '0.0.0.0', '[::]'].includes(config.WEB_BIND_ADDRESS)) throw new Error('不支持的 Web 监听地址');
  if (!/^(?:\.\/)?secrets\/[A-Za-z0-9_./-]+$/.test(config.ADMIN_PASSWORD_PATH) || config.ADMIN_PASSWORD_PATH.split('/').includes('..')) throw new Error('脚本要求密码文件位于项目 secrets 目录内，使用相对路径');
  const url = new URL(config.PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /[\s$#'"\\]/.test(config.PUBLIC_ORIGIN)) throw new Error('Web 地址必须为 http(s)://地址[:端口]，不能包含路径或凭据');
  config.PUBLIC_ORIGIN = url.origin;
  if (!['true', 'false'].includes(config.COOKIE_SECURE) || (config.COOKIE_SECURE === 'true') !== (url.protocol === 'https:')) throw new Error('HTTPS 地址须使用 COOKIE_SECURE=true，HTTP 地址使用 false');
  return Object.fromEntries(keys.map(key => [key, config[key]]));
}
export function installationConfig(options) {
  const ip = address(options.ip || '');
  const ztPort = port(options['zt-port'] || '9993', 'ZeroTier 端口');
  const webPort = port(options['web-port'] || '3443', 'Web 端口');
  const access = options.access || 'public';
  if (!['public', 'local', 'proxy'].includes(access)) throw new Error('访问方式必须为 public、local 或 proxy');
  const endpoints = [`${ip}/${ztPort}`];
  if (options.ipv6) {
    if (isIP(options.ipv6) !== 6) throw new Error('附加地址须为 IPv6');
    endpoints.push(`${address(options.ipv6)}/${ztPort}`);
  }
  const host = isIP(ip) === 6 ? `[${ip}]` : ip;
  const origin = options.origin || (access === 'local' ? `http://localhost:${webPort}` : `http://${host}:${webPort}`);
  if (access === 'proxy' && !origin.startsWith('https://')) throw new Error('HTTPS 反向代理模式需要填写 https://域名');
  return validateConfig({
    COMPOSE_PROJECT_NAME: options['project-name'] || 'zerotier-control',
    PLANET_ENDPOINTS: endpoints.join(','), ZT_PORT: ztPort, WEB_PORT: webPort,
    WEB_BIND_ADDRESS: access === 'public' ? (isIP(ip) === 6 ? '[::]' : '0.0.0.0') : '127.0.0.1',
    PUBLIC_ORIGIN: origin, COOKIE_SECURE: origin.startsWith('https://') ? 'true' : 'false'
  });
}
export function parseConfig(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) throw new Error('.env 格式错误，请使用 KEY=value');
    if (!keys.includes(match[1])) continue;
    if (Object.hasOwn(result, match[1])) throw new Error(`.env 重复配置 ${match[1]}`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  // Before the installer, the manual Compose instructions used port 8080.
  if (!result.WEB_PORT) result.WEB_PORT = '8080';
  return validateConfig(result);
}
async function passwordPath(root, config) {
  const path = resolve(root, config.ADMIN_PASSWORD_PATH);
  if (!relative(root, path) || relative(root, path).startsWith('..')) throw new Error('密码路径超出项目目录');
  // Avoid following symlinks when a privileged helper writes credentials.
  let cursor = root;
  for (const component of relative(root, path).split(/[\\/]/)) {
    cursor = resolve(cursor, component);
    const info = await lstat(cursor).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (info?.isSymbolicLink()) throw new Error('密码路径不能使用符号链接');
  }
  return path;
}
export async function ensurePassword(root, config, reset = false) {
  const path = await passwordPath(root, config);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  if (!reset) {
    try {
      await writeFile(path, (await passwordHash('admin')) + '\n', { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const old = (await readFile(path, 'utf8')).trim();
      if (!isPasswordHash(old)) {
        if (old !== 'admin' && (old.length < 12 || old.length > 256)) throw new Error('已有密码文件无效，请检查后再安装');
        const temporary = `${path}.new-${randomBytes(8).toString('hex')}`;
        await writeFile(temporary, (await passwordHash(old)) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporary, path);
      }
    }
  } else {
    const temporary = `${path}.new-${randomBytes(8).toString('hex')}`;
    await writeFile(temporary, (await passwordHash('admin')) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  }
  await chmod(path, 0o600);
}
async function main() {
  const [command, ...args] = process.argv.slice(2), root = process.cwd();
  if (command === 'detected-ip') {
    if (args.length !== 2 || !['4', '6'].includes(args[1])) throw new Error('公网地址检测参数错误');
    console.log(detectedAddress(args[0], args[1]));
  } else if (command === 'init') {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.slice(2);
      if (!args[i]?.startsWith('--') || !['ip', 'ipv6', 'zt-port', 'web-port', 'access', 'origin', 'project-name'].includes(key) || !args[i + 1]) throw new Error('安装参数错误');
      options[key] = args[i + 1];
    }
    const config = installationConfig(options);
    await writeFile(resolve(root, '.env'), keys.map(key => `${key}=${config[key]}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('部署配置已保存到 .env。');
  } else {
    const config = parseConfig(await readFile(resolve(root, '.env'), 'utf8'));
    if (command === 'cleanup-plan' || command === 'cleanup-remove') {
      if (args.length !== (command === 'cleanup-remove' ? 3 : 2) || !/^\.cleanup-compose\.[A-Za-z0-9]+$/.test(args[0])) throw new Error('数据清理参数错误');
      const composition = JSON.parse(await readFile(resolve(root, args[0]), 'utf8'));
      const plan = await cleanupPlan(root, composition, config.COMPOSE_PROJECT_NAME, args[1]);
      if (command === 'cleanup-plan') {
        for (const volume of plan.volumes) console.log(`VOLUME=${volume}`);
        for (const path of plan.paths) console.log(`PATH=${path}`);
      } else {
        if (args[2] !== config.COMPOSE_PROJECT_NAME) throw new Error('尚未确认当前部署名称');
        await removeProjectData(root);
      }
    } else if (command === 'env') console.log(keys.map(key => `${key}=${config[key]}`).join('\n'));
    else if (command === 'password' && (!args.length || (args.length === 1 && args[0] === '--reset'))) {
      await ensurePassword(root, config, args.includes('--reset'));
      console.log(`初始密码哈希已保存到 ${config.ADMIN_PASSWORD_PATH}（权限 600）。`);
    } else throw new Error('不支持的配置操作');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`配置失败：${error.message}`); process.exitCode = 1; });
}
