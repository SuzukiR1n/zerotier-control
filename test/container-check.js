import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base = 'http://127.0.0.1:8080', saved = '/tmp/zt-control-ci/state.json';
const accountPath = '/tmp/zt-control-ci/web-account.json';
const afterReset = process.argv.includes('--after-reset');
const afterRestart = process.argv.includes('--after-restart') || afterReset;
let credentials = !afterRestart || afterReset ? { username: 'admin', password: 'admin' } : JSON.parse(await readFile(accountPath, 'utf8'));
const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(response.status, 200);
let session = await response.json();
let csrf = session.csrf;
let cookie = response.headers.get('set-cookie').split(';')[0];
async function api(path, method = 'GET', data) {
  const res = await fetch(base + '/api' + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: data ? JSON.stringify(data) : undefined });
  const value = await res.json(); assert.ok(res.ok, JSON.stringify(value)); return value;
}
if (!afterRestart || afterReset) {
  assert.equal(session.mustChangeCredentials, true);
  for (const path of ['/networks', '/planet/download']) {
    const denied = await fetch(base + '/api' + path, { headers: { Cookie: cookie } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, 'CREDENTIAL_CHANGE_REQUIRED');
  }
  if (afterReset) {
    const old = await readFile(accountPath, 'utf8');
    await writeFile('/tmp/zt-control-ci/before-reset-account.json', old, { mode: 0o600 });
    const rejected = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: old });
    assert.equal(rejected.status, 401);
  }
  const restrictedCookie = cookie;
  credentials = { username: afterReset ? 'ci-recovered' : 'ci-operator', password: randomBytes(24).toString('base64url') };
  const changed = await fetch(base + '/api/account', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...credentials, confirmPassword: credentials.password }) });
  assert.equal(changed.status, 200); session = await changed.json();
  assert.equal(session.mustChangeCredentials, false); assert.equal(session.user, credentials.username);
  csrf = session.csrf; cookie = changed.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/api/networks', { headers: { Cookie: restrictedCookie } })).status, 401);
  await writeFile(accountPath, JSON.stringify(credentials), { mode: 0o600 });
  console.log('Initial admin login → forced credential change → restricted session invalidation passed.');
} else {
  assert.equal(session.mustChangeCredentials, false); assert.equal(session.user, credentials.username);
}
const status = await api('/status'); assert.equal(status.version, '1.16.2');
const controllerCli = JSON.parse(execFileSync('docker', ['compose', '-p', 'control-ci', '-f', 'compose.yaml', '-f', 'deploy/compose.ci.yaml', 'exec', '-T', 'controller', 'zerotier-cli', '-j', 'info'], { encoding: 'utf8' }));
assert.equal(controllerCli.address, status.address);
assert.equal(controllerCli.version, '1.16.2');
const planet = await api('/planet'); assert.equal(planet.available, true);
assert.equal(planet.roots[0].identity.split(':')[0], status.address);
assert.equal(planet.roots[0].stableEndpoints[0], '172.30.0.2/19993');
const downloaded = await fetch(base + '/api/planet/download', { headers: { Cookie: cookie } });
const bytes = Buffer.from(await downloaded.arrayBuffer());
assert.equal(createHash('sha256').update(bytes).digest('hex'), planet.sha256);
if (afterRestart) {
  const before = JSON.parse(await readFile(saved, 'utf8'));
  assert.equal(status.address, before.address); assert.equal(planet.sha256, before.sha256);
  assert.equal((await api(`/networks/${before.networkId}`)).name, 'CI Fresh Network');
  console.log('Container recreation preserved controller identity, Planet and network.');
} else {
  assert.deepEqual(await api('/networks'), []);
  const n = await api('/networks', 'POST', { name: 'CI Fresh Network', cidr: '10.42.0.0/24' });
  assert.equal(n.private, true); assert.equal(n.v4AssignMode.zt, true);
  const renamed = await api(`/networks/${n.id}`, 'PATCH', { dns: { domain: 'ci.example', servers: ['10.42.0.1'] } });
  assert.equal(renamed.dns.domain, 'ci.example');
  await api(`/networks/${n.id}/members/012345abcd`, 'PATCH', { authorized: true, name: 'CI Member', ipAssignments: ['10.42.0.20'] });
  assert.equal((await api(`/networks/${n.id}/members`))[0].name, 'CI Member');
  await writeFile('/tmp/zt-control-ci/planet', bytes);
  await writeFile(saved, JSON.stringify({ address: status.address, sha256: planet.sha256, networkId: n.id }));
  console.log('Fresh 1.16.2 controller → Web login → network/member/DNS → Planet download passed.');
}
