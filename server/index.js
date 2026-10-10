import { mkdir, chmod, lstat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createApp } from './app.js';

const env = process.env;
const demo = process.argv.includes('--demo') || env.DEMO_MODE === 'true';
const host = env.HOST || '127.0.0.1', port = Number(env.PORT || 8080);
if (demo && !['127.0.0.1', '::1', 'localhost'].includes(host) && env.DEMO_ALLOW_REMOTE !== 'true') throw new Error('演示模式默认仅允许本机访问');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1–65535');
try {
  const app = await createApp({ demo, passwordFile: env.ADMIN_PASSWORD_FILE, passwordHash: env.ADMIN_PASSWORD_HASH, ztUrl: env.ZT_API_URL, tokenFile: env.ZT_TOKEN_FILE, ztToken: env.ZT_TOKEN, origin: env.PUBLIC_ORIGIN, secureCookie: env.COOKIE_SECURE === undefined ? undefined : env.COOKIE_SECURE === 'true', dataDir: env.DATA_DIR || './data', planetDir: env.PLANET_DIR });
  const socket = env.SOCKET_PATH;
  if (socket) {
    await mkdir(dirname(socket), { recursive: true });
    const old = await lstat(socket).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (old && !old.isSocket()) throw new Error('SOCKET_PATH 已被非 socket 文件占用');
    if (old) await unlink(socket);
  }
  app.server.on('error', () => { console.error('无法启动监听，请检查地址、端口和文件权限'); process.exitCode = 1; });
  app.server.listen(socket || { host, port }, async () => {
    if (socket) await chmod(socket, 0o666);
    console.log(`ZeroTier Control ${demo ? '[演示模式]' : ''} ${socket ? '已启动（Unix socket）' : `http://${host}:${port}`}`);
  });
  let stopping = false;
  function stop() {
    if (stopping) return; stopping = true;
    app.server.close(async () => { await app.flushAudit(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
} catch (e) { console.error(e.message); process.exitCode = 1; }
