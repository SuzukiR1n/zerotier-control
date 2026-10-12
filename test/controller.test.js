import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Controller } from '../server/controller.js';

async function upstream(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push(req.url);
    if (req.headers['x-zt1-auth'] !== 'test-only-controller-token') { res.writeHead(401); res.end('{}'); return; }
    const { body = {}, status = 200 } = await handler(req.url);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { controller: new Controller({ url: `http://127.0.0.1:${server.address().port}`, token: 'test-only-controller-token' }), requests };
}
const node = '012345abcd', unnamed = 'abcdef1234', unrelated = '9999999999';
const networks = ['a1b2c3d4e5000001', 'a1b2c3d4e5000002', 'a1b2c3d4e5000003'];
const peers = [{ address: node.toUpperCase(), role: 'LEAF', latency: 10, paths: [{ address: '192.0.2.1/9993', active: true }] }, { address: unnamed, role: 'LEAF', latency: -1, paths: [] }];

test('peer names merge all networks, deduplicate aliases and only read connected members', async t => {
  const f = await upstream(t, async path => {
    if (path === '/peer') return { body: peers };
    if (path === '/controller/network') return { body: networks };
    if (path.endsWith('/member')) return { body: { [node]: 1, [unnamed]: 2, [unrelated]: 3 } };
    if (path.endsWith(`/member/${node}`)) return { body: { name: path.includes(networks[1]) ? ' Workstation ' : 'NAS & Storage', identity: 'must-not-be-exported' } };
    if (path.endsWith(`/member/${unnamed}`)) return { body: { name: '   ' } };
    return { status: 404 };
  });
  const result = await f.controller.peers();
  assert.deepEqual(result[0].deviceNames, ['NAS & Storage', 'Workstation']);
  assert.deepEqual(result[1].deviceNames, []);
  assert.equal(result[0].address, peers[0].address);
  assert.deepEqual(result[0].paths, peers[0].paths);
  assert.equal(result[0].latency, 10);
  assert.equal(result[0].deviceNamesUnavailable, false);
  assert.ok(!f.requests.some(path => path.endsWith(`/member/${unrelated}`)));
  assert.ok(!JSON.stringify(result).includes('must-not-be-exported'));
  assert.ok(!JSON.stringify(result).includes('test-only-controller-token'));
});

test('name lookup failures preserve connections and names from working networks', async t => {
  const f = await upstream(t, async path => {
    if (path === '/peer') return { body: peers };
    if (path === '/controller/network') return { body: networks };
    if (path === `/controller/network/${networks[1]}/member`) return { status: 500 };
    if (path === `/controller/network/${networks[2]}/member`) return { status: 404 };
    if (path.endsWith('/member')) return { body: { [node]: 1, [unnamed]: 2 } };
    if (path.endsWith(`/member/${node}`)) return { body: { name: 'NAS' } };
    return { status: 404 };
  });
  const result = await f.controller.peers();
  assert.deepEqual(result.map(p => p.address), peers.map(p => p.address));
  assert.deepEqual(result[0].deviceNames, ['NAS']);
  assert.ok(result.every(p => p.deviceNamesUnavailable));
  const broken = await upstream(t, path => path === '/peer' ? { body: peers } : { status: 500 });
  assert.ok((await broken.controller.peers()).every(p => p.deviceNamesUnavailable));
});

test('deleted members are harmless, failed member reads are flagged and bad peer data is rejected', async t => {
  let memberStatus = 404;
  const f = await upstream(t, path => {
    if (path === '/peer') return { body: peers };
    if (path === '/controller/network') return { body: [networks[0]] };
    if (path.endsWith('/member')) return { body: { [node]: 1, [unnamed]: 2 } };
    return { status: memberStatus };
  });
  assert.ok((await f.controller.peers()).every(p => !p.deviceNamesUnavailable));
  memberStatus = 500;
  assert.ok((await f.controller.peers()).every(p => p.deviceNamesUnavailable));
  const invalid = await upstream(t, () => ({ body: [{ address: '../invalid-node' }] }));
  await assert.rejects(invalid.controller.peers(), e => e.status === 502);
  const empty = await upstream(t, () => ({ body: [] }));
  assert.deepEqual(await empty.controller.peers(), []);
  assert.deepEqual(empty.requests, ['/peer']);
});

test('cross-network peer name requests respect global concurrency limits', async t => {
  const ids = Array.from({ length: 18 }, (_, i) => `a1b2c3d4e5${i.toString(16).padStart(6, '0')}`);
  let lists = 0, details = 0, maxLists = 0, maxDetails = 0;
  const f = await upstream(t, async path => {
    if (path === '/peer') return { body: peers };
    if (path === '/controller/network') return { body: ids };
    const list = path.endsWith('/member');
    if (list) { lists++; maxLists = Math.max(maxLists, lists); }
    else { details++; maxDetails = Math.max(maxDetails, details); }
    await new Promise(resolve => setTimeout(resolve, 15));
    if (list) { lists--; return { body: { [node]: 1, [unnamed]: 2 } }; }
    details--; return { body: { name: 'NAS' } };
  });
  const result = await f.controller.peers();
  assert.deepEqual(result[0].deviceNames, ['NAS']);
  assert.ok(maxLists > 1 && maxLists <= 6, `Member lists in flight: ${maxLists}`);
  assert.ok(maxDetails > 1 && maxDetails <= 8, `Member details in flight: ${maxDetails}`);
});
