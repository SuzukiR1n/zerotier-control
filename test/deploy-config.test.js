import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePassword, installationConfig, parseConfig, validateConfig } from '../scripts/deploy-config.js';

test('installer config supports public IP, local tunnel and HTTPS with consistent binding/cookies', () => {
  const publicConfig = installationConfig({ ip: '203.0.113.20' });
  assert.equal(publicConfig.PUBLIC_ORIGIN, 'http://203.0.113.20:3443');
  assert.equal(publicConfig.WEB_BIND_ADDRESS, '0.0.0.0');
  assert.equal(publicConfig.COOKIE_SECURE, 'false');
  const ipv6 = installationConfig({ ip: '2001:db8::1', 'zt-port': '9994' });
  assert.equal(ipv6.PUBLIC_ORIGIN, 'http://[2001:db8::1]:3443');
  assert.equal(ipv6.PLANET_ENDPOINTS, '2001:db8::1/9994');
  assert.equal(ipv6.WEB_BIND_ADDRESS, '[::]');
  assert.equal(installationConfig({ ip: '203.0.113.20', access: 'local' }).PUBLIC_ORIGIN, 'http://localhost:3443');
  const proxy = installationConfig({ ip: '203.0.113.20', access: 'proxy', origin: 'https://control.example.com' });
  assert.equal(proxy.COOKIE_SECURE, 'true');
  assert.equal(proxy.WEB_BIND_ADDRESS, '127.0.0.1');
  assert.throws(() => installationConfig({ ip: '203.0.113.20', access: 'proxy' }));
});
test('installer refuses malformed endpoints, unsafe env values and credential paths', () => {
  const valid = installationConfig({ ip: '203.0.113.20' });
  for (const ip of ['example.com', '$(touch /tmp/unwanted)', '0.0.0.0', '224.0.0.1', '::', 'ff02::1', 'fe80::1%eth0']) assert.throws(() => installationConfig({ ip }));
  for (const p of ['0', '65536', '9993\nSECRET=x', '9e3', '00080']) assert.throws(() => installationConfig({ ip: '203.0.113.20', 'zt-port': p }));
  for (const origin of ['http://user:pass@host', 'https://host/path', 'https://host?key=x', 'http://$(whoami).example']) assert.throws(() => validateConfig({ ...valid, PUBLIC_ORIGIN: origin }));
  for (const path of ['/tmp/password', 'secrets/../README.md', '.env', './server/app.js']) assert.throws(() => validateConfig({ ...valid, ADMIN_PASSWORD_PATH: path }));
  assert.throws(() => parseConfig('PLANET_ENDPOINTS=$(whoami)/9993\nPUBLIC_ORIGIN=http://localhost:8080'));
  assert.throws(() => parseConfig('PLANET_ENDPOINTS=203.0.113.20/9993\nPLANET_ENDPOINTS=203.0.113.21/9993'));
  const legacy = parseConfig('PLANET_ENDPOINTS=203.0.113.20/9993\nWEB_PORT=8080\nPUBLIC_ORIGIN="http://localhost:8080"\n');
  assert.equal(legacy.WEB_BIND_ADDRESS, '127.0.0.1');
  assert.equal(legacy.PUBLIC_ORIGIN, 'http://localhost:8080');
});
test('password generation preserves an existing secret, resets explicitly and refuses symlinks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zt-deploy-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = installationConfig({ ip: '203.0.113.20' });
  await ensurePassword(root, config);
  const file = join(root, 'secrets', 'admin-password');
  const before = await readFile(file);
  assert.ok(before.toString().trim().length >= 24);
  await ensurePassword(root, config);
  assert.ok(before.equals(await readFile(file)), 'Repeated install must preserve the password');
  await ensurePassword(root, config, true);
  assert.ok(!before.equals(await readFile(file)), 'Explicit reset must change the password');
  if (process.platform !== 'win32') {
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const outside = join(root, 'outside'); await writeFile(outside, 'untouched');
    const link = join(root, 'secrets', 'link'); await symlink(outside, link);
    await assert.rejects(ensurePassword(root, { ...config, ADMIN_PASSWORD_PATH: './secrets/link' }, true), /符号链接/);
    assert.equal(await readFile(outside, 'utf8'), 'untouched');
  }
});
