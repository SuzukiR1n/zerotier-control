import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { HttpError } from './validation.js';

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}
export class Controller {
  constructor({ url, tokenFile, token }) {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('ZT_API_URL 必须是控制器的 HTTP(S) 根地址');
    this.url = u.origin; this.tokenFile = tokenFile; this.token = token;
  }
  async request(path, method = 'GET', body) {
    let token;
    try { token = this.tokenFile ? (await readFile(this.tokenFile, 'utf8')).trim() : this.token; }
    catch { throw new HttpError(503, '无法读取控制器密钥文件，请检查文件路径和权限'); }
    if (!token) throw new HttpError(503, '尚未配置控制器密钥');
    let res;
    try {
      res = await fetch(this.url + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'X-ZT1-AUTH': token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new HttpError(502, '无法连接 ZeroTier 控制器，请检查服务地址、端口和访问许可'); }
    if (!res.ok) {
      await res.body?.cancel();
      throw new HttpError(res.status === 404 ? 404 : 502, res.status === 404 ? '控制器中找不到该记录' : `控制器请求失败（HTTP ${res.status}），请检查密钥和访问许可`);
    }
    const raw = await res.text();
    try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(502, '控制器返回了无法识别的数据'); }
  }
  status() { return this.request('/status'); }
  peers() { return this.request('/peer'); }
  async networks() {
    const ids = await this.request('/controller/network');
    if (!Array.isArray(ids) || ids.some(id => !/^[0-9a-f]{16}$/i.test(id))) throw new HttpError(502, '控制器网络列表格式不正确');
    return mapLimit(ids, 6, async id => {
      const [n, members] = await Promise.all([this.network(id), this.request(`/controller/network/${id}/member`)]);
      return { ...n, memberCount: Object.keys(members).length };
    });
  }
  network(id) { return this.request(`/controller/network/${id}`); }
  async members(id) {
    const revisions = await this.request(`/controller/network/${id}/member`);
    const ids = Object.keys(revisions);
    if (ids.some(x => !/^[0-9a-f]{10}$/i.test(x))) throw new HttpError(502, '控制器成员列表格式不正确');
    return mapLimit(ids, 8, x => this.request(`/controller/network/${id}/member/${x}`));
  }
  async create(patch) {
    const s = await this.status();
    if (!/^[0-9a-f]{10}$/i.test(s.address)) throw new HttpError(502, '控制器节点 ID 不正确');
    return this.request(`/controller/network/${s.address}______`, 'POST', patch);
  }
  update(id, patch) { return this.request(`/controller/network/${id}`, 'POST', patch); }
  updateMember(id, member, patch) { return this.request(`/controller/network/${id}/member/${member}`, 'POST', patch); }
  delete(id) { return this.request(`/controller/network/${id}`, 'DELETE'); }
  async deleteMember(id, member) {
    // Revocation must precede deletion; an online client may appear again afterwards.
    await this.updateMember(id, member, { authorized: false });
    return this.request(`/controller/network/${id}/member/${member}`, 'DELETE');
  }
}

export class DemoController {
  constructor() {
    this.items = new Map(); this.people = new Map();
    const base = { private: true, enableBroadcast: true, mtu: 2800, multicastLimit: 32, v4AssignMode: { zt: true }, v6AssignMode: { zt: false, rfc4193: false, '6plane': false }, dns: { domain: '', servers: [] }, rules: [{ type: 'ACTION_ACCEPT' }], revision: 1 };
    ['HomeLab / 家庭实验室', 'Studio / 远程协作', 'Edge / 边缘设备'].forEach((name, i) => {
      const id = `a1b2c3d4e5${['a1b2c3', 'd4e5f6', '102030'][i]}`;
      this.items.set(id, { ...structuredClone(base), id, nwid: id, name, creationTime: Date.now() - 86400000 * (20 + i), routes: [{ target: `10.${10 + i}.0.0/24`, via: null }], ipAssignmentPools: [{ ipRangeStart: `10.${10 + i}.0.10`, ipRangeEnd: `10.${10 + i}.0.250` }] });
      const names = i === 0 ? ['NAS · Storage', 'MacBook Pro', 'Debian · Gateway', 'iPhone', '新设备'] : i === 1 ? ['Workstation', 'Render Server', '新设备'] : ['Raspberry Pi', 'Edge Gateway'];
      this.people.set(id, new Map(names.map((name, j) => {
        const mid = randomBytes(5).toString('hex');
        return [mid, { id: mid, address: mid, nwid: id, name, authorized: !name.includes('新'), activeBridge: false, noAutoAssignIps: false, ipAssignments: name.includes('新') ? [] : [`10.${10 + i}.0.${11 + j}`], identity: name.includes('新') ? '' : `${mid}:0:demo-public-identity`, vMajor: 1, vMinor: 14, vRev: 1, revision: 1 }];
      })));
    });
  }
  async status() { return { address: 'a1b2c3d4e5', version: '1.14.1', online: true, tcpFallbackActive: false }; }
  async peers() { return [{ address: '7f1234abcd', role: 'PLANET', latency: 28, versionMajor: 1, versionMinor: 14, versionRev: 1, paths: [{ address: '203.0.113.10/9993', active: true, preferred: true }] }, { address: '8e2345bcde', role: 'PLANET', latency: 86, paths: [{ address: '198.51.100.20/9993', active: true, preferred: false }] }]; }
  async networks() { return [...this.items.values()].map(n => ({ ...structuredClone(n), memberCount: this.people.get(n.id).size })); }
  async network(id) { if (!this.items.has(id)) throw new HttpError(404, '网络不存在'); return structuredClone(this.items.get(id)); }
  async members(id) { await this.network(id); return [...this.people.get(id).values()].map(m => structuredClone(m)); }
  async create(patch) { const id = 'a1b2c3d4e5' + randomBytes(3).toString('hex'); const n = { ...(await this.network(this.items.keys().next().value).catch(() => ({ enableBroadcast: true, mtu: 2800, multicastLimit: 32, routes: [], ipAssignmentPools: [], v4AssignMode: { zt: false }, v6AssignMode: {}, dns: { domain: '', servers: [] } }))), ...patch, id, nwid: id, creationTime: Date.now(), revision: 1 }; this.items.set(id, n); this.people.set(id, new Map()); return structuredClone(n); }
  async update(id, patch) { const n = { ...(await this.network(id)), ...patch }; n.revision++; this.items.set(id, n); return structuredClone(n); }
  async updateMember(id, mid, patch) { await this.network(id); const m = { id: mid, address: mid, authorized: false, ipAssignments: [], ...this.people.get(id).get(mid), ...patch }; this.people.get(id).set(mid, m); return structuredClone(m); }
  async delete(id) { const n = await this.network(id); this.items.delete(id); this.people.delete(id); return n; }
  async deleteMember(id, mid) { await this.network(id); this.people.get(id).delete(mid); return {}; }
}
