import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:8080', saved = '/tmp/zt-control-ci/state.json';
const password = (await readFile(process.env.TEST_ADMIN_PASSWORD_PATH || '/tmp/zt-control-ci/password', 'utf8')).trim();
const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
assert.equal(response.status, 200);
const csrf = (await response.json()).csrf;
const cookie = response.headers.get('set-cookie').split(';')[0];
async function api(path, method = 'GET', data) {
  const res = await fetch(base + '/api' + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: data ? JSON.stringify(data) : undefined });
  const value = await res.json(); assert.ok(res.ok, JSON.stringify(value)); return value;
}
const status = await api('/status'); assert.equal(status.version, '1.16.2');
const planet = await api('/planet'); assert.equal(planet.available, true);
assert.equal(planet.roots[0].identity.split(':')[0], status.address);
const downloaded = await fetch(base + '/api/planet/download', { headers: { Cookie: cookie } });
const bytes = Buffer.from(await downloaded.arrayBuffer());
assert.equal(createHash('sha256').update(bytes).digest('hex'), planet.sha256);
if (process.argv.includes('--after-restart')) {
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
