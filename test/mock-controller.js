// CI-only disposable controller with the stable 1.14.1 API response shapes.
import { createServer } from 'node:http';
const id = 'a1b2c3d4e5abcdef', mid = '012345abcd';
createServer((req, res) => {
  if (req.headers['x-zt1-auth'] !== 'ci-controller-token') { res.writeHead(401); res.end('{}'); return; }
  const values = {
    '/status': { address: 'a1b2c3d4e5', version: '1.14.1', online: true },
    '/controller/network': [id],
    [`/controller/network/${id}`]: { id, name: 'CI Network', private: true },
    [`/controller/network/${id}/member`]: { [mid]: 1 },
    [`/controller/network/${id}/member/${mid}`]: { id: mid, name: 'CI Member', authorized: true, ipAssignments: ['10.42.0.1'] },
  };
  res.writeHead(Object.hasOwn(values, req.url) ? 200 : 404, { 'content-type': 'application/json' });
  res.end(JSON.stringify(values[req.url] ?? {}));
}).listen(9994, '127.0.0.1', () => console.log('CI mock controller ready'));
