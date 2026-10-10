import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { resetAccount } from '../server/account.js';
import { DemoController } from '../server/controller.js';

const nextPassword = 'new-account-test-password';
async function fixture(t, options = {}) {
  const dir = options.dataDir || await mkdtemp(join(tmpdir(), 'zt-account-test-'));
  if (!options.dataDir) t.after(() => rm(dir, { recursive: true, force: true }));
  const app = await createApp({ dataDir: dir, controller: new DemoController(), ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  let stopped = false;
  const stop = async () => {
    if (stopped) return; stopped = true;
    app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); await app.flushAudit();
  };
  t.after(stop);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie, csrf;
    return async (path, method = 'GET', data, headers = {}) => {
      const res = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie || '', 'X-CSRF-Token': csrf || '', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
      const value = await res.json();
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      if (value.csrf) csrf = value.csrf;
      return { res, value };
    };
  };
  return { dir, stop, client, app };
}
const login = (call, username = 'admin', password = 'admin') => call('/login', 'POST', { username, password });
const change = (call, extra = {}) => call('/account', 'POST', { username: 'operator', password: nextPassword, confirmPassword: nextPassword, ...extra });

test('default login requires username and restricts all controller and Planet access until both credentials change', async t => {
  const f = await fixture(t), call = f.client();
  assert.equal((await call('/account', 'POST', {})).res.status, 401);
  assert.equal((await call('/login', 'POST', { password: 'admin' })).res.status, 401);
  assert.equal((await login(call, 'other-user')).res.status, 401);
  const initial = await login(call);
  assert.equal(initial.res.status, 200); assert.equal(initial.value.mustChangeCredentials, true);
  assert.equal((await call('/session')).value.mustChangeCredentials, true);
  for (const path of ['/status', '/networks', '/peers', '/audit', '/planet', '/planet/download']) {
    const denied = await call(path);
    assert.equal(denied.res.status, 403); assert.equal(denied.value.code, 'CREDENTIAL_CHANGE_REQUIRED');
  }
  assert.equal((await call('/networks', 'POST', { name: 'Blocked', cidr: '10.42.0.0/24' })).res.status, 403);
  assert.equal((await change(call, { username: 'admin' })).res.status, 400);
  assert.equal((await change(call, { password: 'short', confirmPassword: 'short' })).res.status, 400);
  assert.equal((await change(call, { confirmPassword: 'different-password' })).res.status, 400);
  assert.equal((await change(call, { mustChangeCredentials: false })).res.status, 400);
  assert.equal((await change(call, { username: '<script>' })).res.status, 400);
  assert.equal((await call('/logout', 'POST', {})).res.status, 200);
  assert.equal((await call('/session')).value.authenticated, false);
});

test('account setup checks CSRF and origin, rotates the session and invalidates other bootstrap logins', async t => {
  const f = await fixture(t), first = f.client(), second = f.client();
  const before = await login(first); await login(second);
  const data = { username: 'operator', password: nextPassword, confirmPassword: nextPassword };
  assert.equal((await first('/account', 'POST', data, { 'X-CSRF-Token': 'wrong' })).res.status, 403);
  assert.equal((await first('/account', 'POST', data, { Origin: 'https://evil.example' })).res.status, 403);
  const changed = await change(first);
  assert.equal(changed.res.status, 200); assert.equal(changed.value.user, 'operator');
  assert.equal(changed.value.mustChangeCredentials, false);
  assert.notEqual(changed.value.csrf, before.value.csrf);
  assert.notEqual(changed.res.headers.get('set-cookie'), before.res.headers.get('set-cookie'));
  assert.equal((await first('/networks')).res.status, 200);
  assert.equal((await second('/networks')).res.status, 401);
  assert.equal((await second('/account', 'POST', data)).res.status, 401);
  assert.equal((await login(second)).res.status, 401);
  assert.equal((await login(second, 'operator', nextPassword)).res.status, 200);
});

test('credentials and setup completion persist across restarts, hash passwords and prevent silent corruption resets', async t => {
  const f = await fixture(t), call = f.client(); await login(call); await change(call);
  const text = await readFile(join(f.dir, 'admin-account.json'), 'utf8');
  const stored = JSON.parse(text); assert.equal(stored.username, 'operator'); assert.equal(stored.mustChangeCredentials, false);
  assert.ok(!text.includes(nextPassword)); assert.match(stored.passwordHash, /^scrypt:/);
  if (process.platform !== 'win32') assert.equal((await stat(join(f.dir, 'admin-account.json'))).mode & 0o777, 0o600);
  await f.stop();
  const restarted = await fixture(t, { dataDir: f.dir }), next = restarted.client();
  assert.equal((await login(next)).res.status, 401);
  assert.equal((await login(next, 'operator', nextPassword)).value.mustChangeCredentials, false);
  assert.equal((await next('/networks')).res.status, 200);
  await restarted.stop();
  await writeFile(join(f.dir, 'admin-account.json'), '{broken');
  await assert.rejects(createApp({ dataDir: f.dir }), /�˺��ļ���/);
});

test('legacy password migration requires changing both values and later edits require the current password', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zt-legacy-account-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const passwordFile = join(root, 'legacy-secret'); await writeFile(passwordFile, 'legacy-admin-password\n');
  const f = await fixture(t, { dataDir: root, passwordFile }), call = f.client();
  assert.equal((await login(call)).res.status, 401);
  assert.equal((await login(call, 'admin', 'legacy-admin-password')).value.mustChangeCredentials, true);
  assert.equal((await change(call, { password: 'legacy-admin-password', confirmPassword: 'legacy-admin-password' })).res.status, 400);
  await change(call);
  const second = f.client(); await login(second, 'operator', nextPassword);
  assert.equal((await change(call, { username: 'new-operator', password: 'updated-admin-password', confirmPassword: 'updated-admin-password' })).res.status, 400);
  assert.equal((await call('/session')).value.authenticated, true);
  assert.equal((await change(call, { username: 'new-operator', password: 'updated-admin-password', confirmPassword: 'updated-admin-password', currentPassword: nextPassword })).res.status, 200);
  assert.equal((await second('/networks')).res.status, 401);
  await f.stop();
  const restarted = await fixture(t, { dataDir: root, passwordFile });
  assert.equal((await login(restarted.client(), 'new-operator', 'updated-admin-password')).res.status, 200);
  await restarted.stop(); await resetAccount(root);
  const reset = await fixture(t, { dataDir: root, passwordFile }), recovery = reset.client();
  assert.equal((await login(recovery)).value.mustChangeCredentials, true);
  assert.equal((await recovery('/networks')).res.status, 403);
});

test('simultaneous first-login changes cannot overwrite an account already claimed by another session', async t => {
  const f = await fixture(t), first = f.client(), second = f.client(); await login(first); await login(second);
  const results = await Promise.all([change(first), change(second, { username: 'other-operator' })]);
  assert.deepEqual(results.map(r => r.res.status).sort(), [200, 401]);
  const stored = JSON.parse(await readFile(join(f.dir, 'admin-account.json'), 'utf8'));
  assert.equal(stored.username, results[0].res.status === 200 ? 'operator' : 'other-operator');
});
