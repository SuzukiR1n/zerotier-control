import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const { networkId, address } = JSON.parse(await readFile('/tmp/zt-control-ci/state.json', 'utf8'));
const cli = (...args) => execFileSync('docker', ['exec', 'zt-client-ci', 'zerotier-cli', ...args], { encoding: 'utf8' });
for (let i = 0; i < 30; i++) { try { cli('-j', 'info'); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
const memberId = JSON.parse(cli('-j', 'info')).address;
cli('join', networkId);
const base = 'http://127.0.0.1:8080';
const credentials = JSON.parse(await readFile('/tmp/zt-control-ci/web-account.json', 'utf8'));
const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', 'X-CSRF-Token': (await login.json()).csrf };
let appeared = false;
for (let i = 0; i < 60; i++) {
  const members = await fetch(`${base}/api/networks/${networkId}/members`, { headers }).then(r => r.json());
  if (members.some(m => m.id === memberId)) { appeared = true; break; }
  await new Promise(r => setTimeout(r, 1000));
}
assert.ok(appeared, 'Client did not reach private Planet/controller');
const res = await fetch(`${base}/api/networks/${networkId}/members/${memberId}`, { method: 'PATCH', headers, body: JSON.stringify({ authorized: true, name: 'Real ZeroTier CI Client' }) });
assert.equal(res.status, 200);
let network;
for (let i = 0; i < 60; i++) {
  network = JSON.parse(cli('-j', 'listnetworks')).find(n => n.nwid === networkId);
  if (network?.status === 'OK' && network.assignedAddresses.length) break;
  await new Promise(r => setTimeout(r, 1000));
}
assert.equal(network?.status, 'OK', JSON.stringify(network));
assert.ok(network.assignedAddresses.some(ip => ip.startsWith('10.42.0.')));
const root = JSON.parse(cli('-j', 'listpeers')).find(p => p.address === address);
assert.equal(root?.role, 'PLANET');
assert.ok(root.paths.some(p => p.active));
const peerResponse = await fetch(`${base}/api/peers`, { headers });
assert.equal(peerResponse.status, 200);
const peer = (await peerResponse.json()).find(p => p.address === memberId);
assert.ok(peer, 'Real client missing from controller connections');
assert.deepEqual(peer.deviceNames, ['Real ZeroTier CI Client']);
assert.equal(peer.deviceNamesUnavailable, false);
console.log('Real controller connections show the device name saved through the Web API.');
console.log('Real ZeroTier 1.16.2 client → private Planet → pending member → Web authorization → assigned IP / OK passed.');
