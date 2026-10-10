import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp, passwordHash } from '../server/app.js';
import { DemoController, Controller } from '../server/controller.js';
import { cidr, networkPatch, memberPatch, subnetDefaults, ipNumber } from '../server/validation.js';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };
const close = async server => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
async function fixture(t, options = {}) {
  const app = await createApp({ demo: true, ...options });
  const base = await listen(app.server); t.after(() => close(app.server));
  let cookie, csrf;
  async function call(path, method = 'GET', value, extraHeaders = {}) {
    const res = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...extraHeaders }, body: value === undefined ? undefined : JSON.stringify(value) });
    const setCookie = res.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
    const data = await res.json(); if (data.csrf) csrf = data.csrf;
    return { res, data };
  }
  return { app, base, call };
}

test('CIDR validation handles IPv4, IPv6, embedded IPv4 and subnet boundaries', () => {
  assert.equal(cidr('10.10.0.0/24').prefix, 24);
  assert.equal(cidr('fd00::/64').bits, 128);
  assert.equal(ipNumber('::ffff:192.0.2.1'), ipNumber('::ffff:c000:201'));
  assert.throws(() => cidr('10.10.0.1/24'));
  assert.throws(() => cidr('::1/129'));
  assert.throws(() => cidr('10.0.0.0/24/trailing'));
  assert.throws(() => cidr('10.0.0.0/24/'));
  assert.throws(() => cidr('fe80::%eth0/64'));
  assert.deepEqual(subnetDefaults('10.10.0.0/24').ipAssignmentPools, [{ ipRangeStart: '10.10.0.1', ipRangeEnd: '10.10.0.254' }]);
});
test('patch validation refuses malformed values, unknown fields and mismatched address families', () => {
  assert.throws(() => networkPatch({ private: 'false' }));
  assert.throws(() => networkPatch({ routes: [{ target: '10.0.0.0/8', via: '::1' }] }));
  assert.throws(() => networkPatch({ ipAssignmentPools: [{ ipRangeStart: '10.0.0.20', ipRangeEnd: '10.0.0.10' }] }));
  assert.throws(() => networkPatch({ dns: { domain: 'x'.repeat(254), servers: [] } }));
  assert.throws(() => memberPatch({ identity: 'overwrite' }));
  assert.throws(() => memberPatch({ ipAssignments: ['10.0.0.1/24'] }));
  assert.throws(() => networkPatch(JSON.parse('{"__proto__":{}}')));
  assert.deepEqual(networkPatch({ v4AssignMode: { zt: true } }), { v4AssignMode: { zt: true } });
});
test('production requires credentials and rejects API reads without login', async t => {
  await assert.rejects(createApp({ demo: false }), /ADMIN_PASSWORD/);
  const f = await fixture(t, { demo: false, passwordHash: await passwordHash('only-a-test-password') });
  assert.equal((await f.call('/networks')).res.status, 401);
  assert.equal((await f.call('/session')).data.authenticated, false);
});
test('login creates HttpOnly session, enforces CSRF and logout invalidates session', async t => {
  const f = await fixture(t, { demo: false, passwordHash: await passwordHash('only-a-test-password'), controller: new DemoController() });
  assert.equal((await f.call('/login', 'POST', { password: 'incorrect' })).res.status, 401);
  const logged = await f.call('/login', 'POST', { password: 'only-a-test-password' });
  assert.equal(logged.res.status, 200);
  assert.match(logged.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await f.call('/networks')).res.status, 200);
  assert.equal((await f.call('/networks', 'POST', { name: 'Test', cidr: '10.0.0.0/24' }, { 'X-CSRF-Token': 'wrong' })).res.status, 403);
  assert.equal((await f.call('/logout', 'POST', {})).res.status, 200);
  assert.equal((await f.call('/networks')).res.status, 401);
});
test('cross-site login and unsafe requests are rejected, HTTPS cookies are Secure', async t => {
  const f = await fixture(t, { origin: 'https://control.example.com' });
  const s = await f.call('/session');
  assert.match(s.res.headers.get('set-cookie'), /; Secure/);
  assert.equal((await f.call('/login', 'POST', { password: 'anything' }, { Origin: 'https://evil.example' })).res.status, 403);
  assert.equal((await f.call('/networks', 'POST', { name: 'Test', cidr: '10.0.0.0/24' }, { 'Sec-Fetch-Site': 'cross-site' })).res.status, 403);
});
test('create, edit, member authorize, address assignment, export and delete work through HTTP', async t => {
  const f = await fixture(t); await f.call('/session');
  const created = await f.call('/networks', 'POST', { name: 'Integration Lab', cidr: '10.42.0.0/24' });
  assert.equal(created.res.status, 201); const id = created.data.id;
  assert.equal(created.data.private, true);
  assert.equal(created.data.v4AssignMode.zt, true);
  const updated = await f.call(`/networks/${id}`, 'PATCH', { name: 'Renamed Lab', dns: { domain: 'lab.example', servers: ['10.42.0.1'] } });
  assert.equal(updated.data.name, 'Renamed Lab');
  assert.deepEqual(updated.data.rules, [{ type: 'ACTION_ACCEPT' }]);
  const mid = '012345abcd';
  const member = await f.call(`/networks/${id}/members/${mid}`, 'PATCH', { name: 'NAS', authorized: true, ipAssignments: ['10.42.0.20'] });
  assert.equal(member.data.authorized, true);
  const list = await f.call(`/networks/${id}/members`); assert.equal(list.data[0].ipAssignments[0], '10.42.0.20');
  const exported = await f.call(`/networks/${id}/export`);
  assert.equal(exported.data.members[0].name, 'NAS');
  assert.match(exported.res.headers.get('content-disposition'), /attachment/);
  assert.equal((await f.call(`/networks/${id}`, 'DELETE', { confirm: 'incorrect' })).res.status, 400);
  assert.equal((await f.call(`/networks/${id}/members/${mid}`, 'DELETE', { confirm: mid })).res.status, 200);
  assert.equal((await f.call(`/networks/${id}`, 'DELETE', { confirm: id })).res.status, 200);
  assert.equal((await f.call(`/networks/${id}`)).res.status, 404);
  assert.ok((await f.call('/audit')).data.some(x => x.action === 'member.authorize'));
});
test('malformed IDs, invalid subnet and unsupported edits never reach controller mutation', async t => {
  const f = await fixture(t); await f.call('/session');
  assert.equal((await f.call('/networks', 'POST', { name: 'Bad subnet', cidr: '10.0.0.1/24' })).res.status, 400);
  assert.equal((await f.call('/networks', 'POST', { name: '', cidr: '10.0.0.0/24' })).res.status, 400);
  assert.equal((await f.call('/networks/not-an-id', 'PATCH', { name: 'bad' })).res.status, 404);
  const id = (await f.call('/networks')).data[0].id;
  assert.equal((await f.call(`/networks/${id}`, 'PATCH', { identity: 'replacement' })).res.status, 400);
});
test('static resources have security headers and secrets cannot be read by a path traversal', async t => {
  const f = await fixture(t);
  const home = await fetch(f.base);
  assert.equal(home.status, 200); assert.match(await home.text(), /ZeroTier Control/);
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(f.base + '/.env')).status, 404);
  assert.equal((await fetch(f.base + '/server/app.js')).status, 404);
  assert.equal((await fetch(f.base + '/%2e%2e/secrets/admin-password')).status, 404);
});
test('login brute force is limited', async t => {
  const f = await fixture(t, { demo: false, passwordHash: await passwordHash('only-a-test-password') });
  for (let i = 0; i < 10; i++) assert.equal((await f.call('/login', 'POST', { password: 'wrong' })).res.status, 401);
  assert.equal((await f.call('/login', 'POST', { password: 'wrong' })).res.status, 429);
});

test('real adapter follows 1.14.1 stable member revision map and sends partial updates with server-side token', async t => {
  const seen = [], mid = '012345abcd', id = 'a1b2c3d4e5abcdef';
  let member = { id: mid, authorized: true, name: 'Before', ipAssignments: [], activeBridge: true };
  const mock = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    seen.push({ path: req.url, method: req.method, auth: req.headers['x-zt1-auth'], data });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/status') res.end(JSON.stringify({ address: 'a1b2c3d4e5', version: '1.14.1' }));
    else if (req.url === '/controller/network') res.end(JSON.stringify([id]));
    else if (req.url === `/controller/network/${id}`) res.end(JSON.stringify({ id, name: 'Real shape' }));
    else if (req.url === `/controller/network/${id}/member`) res.end(JSON.stringify({ [mid]: 4 }));
    else if (req.url.endsWith('/member/' + mid)) {
      if (req.method === 'POST') member = { ...member, ...data };
      res.end(JSON.stringify(member));
    } else if (req.url === '/controller/network/a1b2c3d4e5______') res.end(JSON.stringify({ id, ...data }));
    else { res.statusCode = 404; res.end('{}'); }
  });
  const url = await listen(mock); t.after(() => close(mock));
  const controller = new Controller({ url, token: 'test-controller-secret' });
  assert.equal((await controller.networks())[0].memberCount, 1);
  assert.equal((await controller.members(id))[0].name, 'Before');
  const f = await fixture(t, { controller }); await f.call('/session');
  await f.call(`/networks/${id}/members/${mid}`, 'PATCH', { name: 'After' });
  assert.equal(member.activeBridge, true);
  assert.deepEqual(seen.find(x => x.method === 'POST').data, { name: 'After' });
  await controller.create({ name: 'New', private: true });
  assert.ok(seen.some(x => x.path.endsWith('______')));
  await controller.deleteMember(id, mid);
  assert.equal(seen.at(-2).method, 'POST'); assert.deepEqual(seen.at(-2).data, { authorized: false }); assert.equal(seen.at(-1).method, 'DELETE');
  assert.ok(seen.every(x => x.auth === 'test-controller-secret'));
  const serialized = JSON.stringify((await f.call('/status')).data) + JSON.stringify((await f.call('/audit')).data);
  assert.ok(!serialized.includes('test-controller-secret'));
});
test('upstream authentication failure and connection failure become safe actionable messages', async t => {
  const mock = createServer((req, res) => { res.writeHead(401); res.end('private upstream details'); });
  const url = await listen(mock); t.after(() => close(mock));
  const c = new Controller({ url, token: 'a-test-token' });
  await assert.rejects(c.status(), e => e.status === 502 && !e.message.includes('private upstream details'));
  await assert.rejects(new Controller({ url, tokenFile: '/missing-authtoken-for-tests' }).status(), e => e.status === 503);
});
