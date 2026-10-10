import { createServer } from 'node:http';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, appendFile, mkdir, stat, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Controller, DemoController } from './controller.js';
import { HttpError, insist, networkPatch, memberPatch, subnetDefaults, text, object } from './validation.js';

const scrypt = promisify(scryptCallback);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
const token = () => randomBytes(32).toString('base64url');
const SESSION_TTL = 8 * 60 * 60 * 1000;
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function matches(password, hash) {
  const [, salt, digest] = hash.split(':');
  const result = await scrypt(password, salt, 64);
  return timingSafeEqual(result, Buffer.from(digest, 'hex'));
}
function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, '请使用 JSON 请求');
  let length = 0; const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 65536) throw new HttpError(413, '请求内容过大');
    chunks.push(chunk);
  }
  try { const b = JSON.parse(Buffer.concat(chunks).toString()); insist(object(b), '需要 JSON 对象'); return b; }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'JSON 格式不正确'); }
}
function securityHeaders(res, secure) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
export async function createApp(config) {
  const demo = !!config.demo;
  let hash = config.passwordHash;
  if (!demo && !hash) {
    if (!config.passwordFile) throw new Error('请配置 ADMIN_PASSWORD_FILE 或 ADMIN_PASSWORD_HASH');
    const password = (await readFile(config.passwordFile, 'utf8')).trim();
    if (password.length < 12 || password.length > 256) throw new Error('管理密码必须为 12–256 个字符');
    hash = await passwordHash(password);
  }
  if (!demo && !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) throw new Error('ADMIN_PASSWORD_HASH 格式无效');
  const controller = config.controller ?? (demo ? new DemoController() : new Controller({ url: config.ztUrl ?? 'http://127.0.0.1:9993', tokenFile: config.tokenFile, token: config.ztToken }));
  const origin = config.origin ? new URL(config.origin).origin : null;
  const secure = config.secureCookie ?? origin?.startsWith('https://') ?? false;
  const sessions = new Map(), attempts = new Map(); let globalAttempts = [];
  const audit = []; let auditWrite = Promise.resolve(); let auditFailed = false;
  const now = () => Date.now();
  function cleanup() {
    for (const [k, s] of sessions) if (s.expires < now()) sessions.delete(k);
    for (const [k, a] of attempts) if (a.reset < now()) attempts.delete(k);
  }
  function session(req) {
    const id = /(?:^|;\s*)ztc_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    const s = sessions.get(id);
    return s && s.expires > now() ? { id, ...s } : null;
  }
  function newSession(req, res) {
    cleanup();
    if (sessions.size >= 256) throw new HttpError(503, '登录会话已达上限，请稍后重试');
    const id = token(), s = { csrf: token(), expires: now() + SESSION_TTL };
    sessions.set(id, s);
    res.setHeader('Set-Cookie', `ztc_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`);
    return { id, ...s };
  }
  function checkOrigin(req) {
    const expected = origin ?? `${secure ? 'https' : 'http'}://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== expected) throw new HttpError(403, '请求来源不受信任');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '拒绝跨站请求');
  }
  function writeAudit(action, target) {
    const entry = { time: new Date().toISOString(), action, target };
    audit.unshift(entry); if (audit.length > 200) audit.pop();
    if (config.dataDir && !demo) {
      auditWrite = auditWrite.then(async () => {
        await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
        const path = join(config.dataDir, 'audit.jsonl');
        const size = await stat(path).then(s => s.size).catch(() => 0);
        if (size > 5 * 1024 * 1024) await rename(path, path + '.previous');
        await appendFile(path, JSON.stringify(entry) + '\n', { mode: 0o600 });
      }).catch(() => { auditFailed = true; console.error('审计日志写入失败，请检查数据目录权限'); });
    }
  }
  const server = createServer(async (req, res) => {
    securityHeaders(res, secure);
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
      if (path === '/healthz' && method === 'GET') return json(res, 200, { ok: true });
      if (!path.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, '不支持的请求方法');
        const entry = files.get(path);
        if (!entry) throw new HttpError(404, '页面不存在');
        const content = await readFile(join(publicDir, entry[0]));
        res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache' });
        return res.end(method === 'HEAD' ? undefined : content);
      }
      cleanup();
      let s = session(req);
      if (path === '/api/session' && method === 'GET') {
        if (demo && !s) s = newSession(req, res);
        return json(res, 200, { authenticated: !!s, csrf: s?.csrf, demo, user: s ? 'admin' : null, version: '0.1.0' });
      }
      if (path === '/api/login' && method === 'POST') {
        checkOrigin(req);
        const ip = req.socket.remoteAddress;
        globalAttempts = globalAttempts.filter(t => t > now() - 60000);
        const a = attempts.get(ip) ?? { count: 0, reset: now() + 600000 };
        if (a.count >= 10 || globalAttempts.length >= 30 || attempts.size >= 1024) throw new HttpError(429, '登录尝试过多，请稍后再试');
        a.count++; attempts.set(ip, a); globalAttempts.push(now());
        const b = await body(req);
        if (typeof b.password !== 'string' || b.password.length > 256 || (!demo && !(await matches(b.password, hash)))) throw new HttpError(401, '密码不正确');
        attempts.delete(ip);
        if (s) sessions.delete(s.id);
        s = newSession(req, res); writeAudit('login', 'admin');
        return json(res, 200, { authenticated: true, csrf: s.csrf, demo, user: 'admin' });
      }
      if (!s) throw new HttpError(401, '请先登录');
      if (!['GET', 'HEAD'].includes(method)) {
        checkOrigin(req);
        if (req.headers['x-csrf-token'] !== s.csrf) throw new HttpError(403, '会话校验失败，请刷新后重试');
      }
      if (path === '/api/logout' && method === 'POST') {
        sessions.delete(s.id);
        res.setHeader('Set-Cookie', `ztc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/status' && method === 'GET') {
        const zt = await controller.status();
        return json(res, 200, { address: zt.address, version: zt.version, online: zt.online, tcpFallbackActive: zt.tcpFallbackActive, demo, auditHealthy: !auditFailed });
      }
      if (path === '/api/audit' && method === 'GET') return json(res, 200, audit);
      if (path === '/api/peers' && method === 'GET') return json(res, 200, await controller.peers());
      if (path === '/api/networks' && method === 'GET') return json(res, 200, await controller.networks());
      if (path === '/api/networks' && method === 'POST') {
        const b = await body(req);
        insist(Object.keys(b).every(k => ['name', 'cidr'].includes(k)), '创建网络只接受名称和子网');
        const name = text(b.name, '网络名称'); insist(name.length > 0, '请填写网络名称');
        const patch = networkPatch({ name, private: true, enableBroadcast: true, ...subnetDefaults(b.cidr) });
        const n = await controller.create(patch); writeAudit('network.create', n.id);
        return json(res, 201, n);
      }
      const m = /^\/api\/networks\/([0-9a-f]{16})(?:\/(members|export)(?:\/([0-9a-f]{10}))?)?$/.exec(path);
      if (m) {
        const [, id, action, member] = m;
        if (!action && method === 'GET') return json(res, 200, await controller.network(id));
        if (!action && method === 'PATCH') {
          const n = await controller.update(id, networkPatch(await body(req))); writeAudit('network.update', id); return json(res, 200, n);
        }
        if (!action && method === 'DELETE') {
          const b = await body(req); insist(b.confirm === id, '请输入完整网络 ID 确认删除');
          const n = await controller.delete(id); writeAudit('network.delete', id); return json(res, 200, n);
        }
        if (action === 'members' && !member && method === 'GET') return json(res, 200, await controller.members(id));
        if (action === 'members' && member && method === 'PATCH') {
          const b = await body(req), patch = memberPatch(b);
          // Preserve unrelated member properties by sending a partial update.
          const n = await controller.updateMember(id, member, patch); writeAudit(patch.authorized === undefined ? 'member.update' : patch.authorized ? 'member.authorize' : 'member.deauthorize', `${id}/${member}`);
          return json(res, 200, n);
        }
        if (action === 'members' && member && method === 'DELETE') {
          const b = await body(req); insist(b.confirm === member, '请输入完整节点 ID 确认删除');
          await controller.deleteMember(id, member); writeAudit('member.delete', `${id}/${member}`); return json(res, 200, { ok: true });
        }
        if (action === 'export' && !member && method === 'GET') {
          const [network, members] = await Promise.all([controller.network(id), controller.members(id)]);
          res.setHeader('Content-Disposition', `attachment; filename="network-${id}.json"`);
          return json(res, 200, { format: 'zerotier-control-export-v1', exportedAt: new Date().toISOString(), network, members });
        }
      }
      throw new HttpError(404, '接口不存在');
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (!(e instanceof HttpError)) console.error('管理接口发生内部错误');
      json(res, e instanceof HttpError ? e.status : 500, { error: e instanceof HttpError ? e.message : '服务器内部错误' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 1000;
  server.on('close', () => { sessions.clear(); });
  return { server, controller, flushAudit: () => auditWrite };
}
