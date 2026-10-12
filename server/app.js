import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, appendFile, mkdir, stat, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Controller, DemoController } from './controller.js';
import { planetFiles } from './planet.js';
import { accountStore, matches, passwordHash, validPassword, validUsername } from './account.js';
export { passwordHash } from './account.js';
import { HttpError, insist, networkPatch, memberPatch, subnetDefaults, text, object } from './validation.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/clipboard.js', ['clipboard.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
const token = () => randomBytes(32).toString('base64url');
const SESSION_TTL = 8 * 60 * 60 * 1000;
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
  const accounts = demo ? null : await accountStore(config);
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
    const id = token(), s = { csrf: token(), expires: now() + SESSION_TTL, mustChangeCredentials: !demo && accounts.current.mustChangeCredentials };
    sessions.set(id, s);
    res.setHeader('Set-Cookie', `ztc_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`);
    return { id, ...s };
  }
  function sessionInfo(s) {
    return { authenticated: !!s, csrf: s?.csrf, demo, user: s ? (demo ? 'admin' : accounts.current.username) : null, mustChangeCredentials: !!s?.mustChangeCredentials, version: '0.4.3' };
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
        return json(res, 200, sessionInfo(s));
      }
      if (path === '/api/login' && method === 'POST') {
        checkOrigin(req);
        const ip = req.socket.remoteAddress;
        globalAttempts = globalAttempts.filter(t => t > now() - 60000);
        const a = attempts.get(ip) ?? { count: 0, reset: now() + 600000 };
        if (a.count >= 10 || globalAttempts.length >= 30 || attempts.size >= 1024) throw new HttpError(429, '登录尝试过多，请稍后再试');
        a.count++; attempts.set(ip, a); globalAttempts.push(now());
        const b = await body(req);
        const account = accounts?.current;
        if (!validUsername(b.username) || typeof b.password !== 'string' || b.password.length > 256) throw new HttpError(401, '用户名或密码不正确');
        const passwordMatches = demo || await matches(b.password, account.passwordHash);
        if (!demo && (!passwordMatches || b.username !== account.username || accounts.current !== account)) throw new HttpError(401, '用户名或密码不正确');
        attempts.delete(ip);
        if (s) sessions.delete(s.id);
        s = newSession(req, res); writeAudit('login', sessionInfo(s).user);
        return json(res, 200, sessionInfo(s));
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
      if (path === '/api/account' && method === 'POST') {
        if (demo) throw new HttpError(403, '演示模式不能修改管理账号');
        const b = await body(req);
        insist(Object.keys(b).every(key => ['username', 'password', 'confirmPassword', 'currentPassword'].includes(key)), '账号设置包含未知字段');
        insist(validUsername(b.username), '用户名需要 3–32 个字母、数字、下划线、点或连字符，以字母或数字开头');
        insist(validPassword(b.password), '新密码需要 12–256 个字符');
        insist(b.password === b.confirmPassword, '两次输入的新密码不一致');
        await accounts.update(async account => {
          if (!session(req)) throw new HttpError(401, '会话已失效，请重新登录');
          if (account.mustChangeCredentials) {
            insist(b.username !== account.username, '首次登录必须修改用户名，不能继续使用原用户名');
          } else {
            if (typeof b.currentPassword !== 'string' || b.currentPassword.length > 256 || !(await matches(b.currentPassword, account.passwordHash))) throw new HttpError(400, '当前密码不正确');
          }
          insist(!(await matches(b.password, account.passwordHash)), '新密码必须与原密码不同');
          return { ...account, username: b.username, passwordHash: await passwordHash(b.password), mustChangeCredentials: false };
        });
        sessions.clear();
        s = newSession(req, res);
        writeAudit('account.update', accounts.current.username);
        return json(res, 200, sessionInfo(s));
      }
      if (s.mustChangeCredentials) return json(res, 403, { error: '请先修改用户名和密码', code: 'CREDENTIAL_CHANGE_REQUIRED' });
      if (path === '/api/status' && method === 'GET') {
        const zt = await controller.status();
        return json(res, 200, { address: zt.address, version: zt.version, online: zt.online, tcpFallbackActive: zt.tcpFallbackActive, demo, auditHealthy: !auditFailed });
      }
      if (path === '/api/audit' && method === 'GET') return json(res, 200, audit);
      if (['/api/planet', '/api/planet/download'].includes(path) && method === 'GET') {
        const planet = demo ? { available: false, demo: true } : await planetFiles(config.planetDir);
        if (path.endsWith('/download')) {
          if (!planet.available) throw new HttpError(404, '当前没有可下载的 Planet 文件');
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="planet"', 'Cache-Control': 'no-store' });
          return res.end(planet.bytes);
        }
        const { bytes, ...info } = planet;
        return json(res, 200, info);
      }
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
