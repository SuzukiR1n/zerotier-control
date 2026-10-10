// Runs in the Web image: the server needs Docker, not a host Node.js installation.
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { chmod, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPasswordHash, passwordHash } from '../server/account.js';

const keys = ['COMPOSE_PROJECT_NAME', 'PLANET_ENDPOINTS', 'ZT_PORT', 'WEB_PORT', 'WEB_BIND_ADDRESS', 'ADMIN_PASSWORD_PATH', 'PUBLIC_ORIGIN', 'COOKIE_SECURE'];
function port(value, name) {
  if (!/^[1-9]\d{0,4}$/.test(String(value)) || Number(value) > 65535) throw new Error(`${name} ����Ϊ 1�C65535`);
  return String(value);
}
function address(value) {
  const kind = isIP(value);
  if (!kind || value.includes('%') || (kind === 4 && (value === '0.0.0.0' || (Number(value.split('.')[0]) >= 224 && Number(value.split('.')[0]) <= 239))) || (kind === 6 && (/^ff/i.test(value) || new URL(`http://[${value}]`).hostname === '[::]'))) {
    throw new Error('��������Ч�� IPv4 / IPv6 ��ַ������ʹ��������ȫ���ַ��ಥ��ַ');
  }
  return value;
}
export function validateConfig(input) {
  const config = { COMPOSE_PROJECT_NAME: 'zerotier-control', ZT_PORT: '9993', WEB_PORT: '3443', WEB_BIND_ADDRESS: '127.0.0.1', ADMIN_PASSWORD_PATH: './secrets/admin-password', COOKIE_SECURE: 'false', ...input };
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(config.COMPOSE_PROJECT_NAME)) throw new Error('��������ֻ�ܰ���Сд��ĸ�����֡��»��ߺ����ַ�');
  config.ZT_PORT = port(config.ZT_PORT, 'ZeroTier �˿�');
  config.WEB_PORT = port(config.WEB_PORT, 'Web �˿�');
  const endpoints = String(config.PLANET_ENDPOINTS || '').split(',').map(item => {
    const match = item.trim().match(/^(.+)\/([^/]+)$/);
    if (!match) throw new Error('Planet ��ַ��ʽΪ IP/�˿�');
    return `${address(match[1])}/${port(match[2], 'Planet �˿�')}`;
  });
  if (endpoints.length > 32) throw new Error('Planet ������� 32 ����ַ');
  config.PLANET_ENDPOINTS = [...new Set(endpoints)].join(',');
  if (!['127.0.0.1', '0.0.0.0', '[::]'].includes(config.WEB_BIND_ADDRESS)) throw new Error('��֧�ֵ� Web ������ַ');
  if (!/^(?:\.\/)?secrets\/[A-Za-z0-9_./-]+$/.test(config.ADMIN_PASSWORD_PATH) || config.ADMIN_PASSWORD_PATH.split('/').includes('..')) throw new Error('�ű�Ҫ�������ļ�λ����Ŀ secrets Ŀ¼�ڣ�ʹ�����·��');
  const url = new URL(config.PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /[\s$#'"\\]/.test(config.PUBLIC_ORIGIN)) throw new Error('Web ��ַ����Ϊ http(s)://��ַ[:�˿�]�����ܰ���·����ƾ��');
  config.PUBLIC_ORIGIN = url.origin;
  if (!['true', 'false'].includes(config.COOKIE_SECURE) || (config.COOKIE_SECURE === 'true') !== (url.protocol === 'https:')) throw new Error('HTTPS ��ַ��ʹ�� COOKIE_SECURE=true��HTTP ��ַʹ�� false');
  return Object.fromEntries(keys.map(key => [key, config[key]]));
}
export function installationConfig(options) {
  const ip = address(options.ip || '');
  const ztPort = port(options['zt-port'] || '9993', 'ZeroTier �˿�');
  const webPort = port(options['web-port'] || '3443', 'Web �˿�');
  const access = options.access || 'public';
  if (!['public', 'local', 'proxy'].includes(access)) throw new Error('���ʷ�ʽ����Ϊ public��local �� proxy');
  const endpoints = [`${ip}/${ztPort}`];
  if (options.ipv6) {
    if (isIP(options.ipv6) !== 6) throw new Error('���ӵ�ַ��Ϊ IPv6');
    endpoints.push(`${address(options.ipv6)}/${ztPort}`);
  }
  const host = isIP(ip) === 6 ? `[${ip}]` : ip;
  const origin = options.origin || (access === 'local' ? `http://localhost:${webPort}` : `http://${host}:${webPort}`);
  if (access === 'proxy' && !origin.startsWith('https://')) throw new Error('HTTPS �������ģʽ��Ҫ��д https://����');
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
    if (!match) throw new Error('.env ��ʽ������ʹ�� KEY=value');
    if (!keys.includes(match[1])) continue;
    if (Object.hasOwn(result, match[1])) throw new Error(`.env �ظ����� ${match[1]}`);
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
  if (!relative(root, path) || relative(root, path).startsWith('..')) throw new Error('����·��������ĿĿ¼');
  // Avoid following symlinks when a privileged helper writes credentials.
  let cursor = root;
  for (const component of relative(root, path).split(/[\\/]/)) {
    cursor = resolve(cursor, component);
    const info = await lstat(cursor).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (info?.isSymbolicLink()) throw new Error('����·������ʹ�÷�������');
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
        if (old !== 'admin' && (old.length < 12 || old.length > 256)) throw new Error('���������ļ���Ч��������ٰ�װ');
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
  if (command === 'init') {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.slice(2);
      if (!args[i]?.startsWith('--') || !['ip', 'ipv6', 'zt-port', 'web-port', 'access', 'origin', 'project-name'].includes(key) || !args[i + 1]) throw new Error('��װ��������');
      options[key] = args[i + 1];
    }
    const config = installationConfig(options);
    await writeFile(resolve(root, '.env'), keys.map(key => `${key}=${config[key]}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('���������ѱ��浽 .env��');
  } else {
    const config = parseConfig(await readFile(resolve(root, '.env'), 'utf8'));
    if (command === 'env') console.log(keys.map(key => `${key}=${config[key]}`).join('\n'));
    else if (command === 'password' && (!args.length || (args.length === 1 && args[0] === '--reset'))) {
      await ensurePassword(root, config, args.includes('--reset'));
      console.log(`��ʼ�����ϣ�ѱ��浽 ${config.ADMIN_PASSWORD_PATH}��Ȩ�� 600����`);
    } else throw new Error('��֧�ֵ����ò���');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`����ʧ�ܣ�${error.message}`); process.exitCode = 1; });
}
