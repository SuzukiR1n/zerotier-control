import { get } from 'node:http';
const request = get(process.env.SOCKET_PATH ? { socketPath: process.env.SOCKET_PATH, path: '/healthz' } : `http://127.0.0.1:${process.env.PORT || 8080}/healthz`, res => { res.resume(); process.exitCode = res.statusCode === 200 ? 0 : 1; });
request.setTimeout(4000, () => { request.destroy(); });
request.on('error', () => { process.exitCode = 1; });
