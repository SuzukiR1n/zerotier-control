import { isIP } from 'node:net';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const insist = (ok, message) => { if (!ok) throw new HttpError(400, message); };
export const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function text(v, label, max = 128) {
  insist(typeof v === 'string' && v.length <= max && !/[\u0000-\u001f]/.test(v), `${label}格式不正确（最多 ${max} 个字符）`);
  return v.trim();
}
export function ipNumber(ip) {
  if (isIP(ip) === 4) return ip.split('.').reduce((n, octet) => (n << 8n) + BigInt(octet), 0n);
  insist(isIP(ip) === 6 && !ip.includes('%'), 'IP 地址格式不正确');
  let s = ip;
  if (s.includes('.')) {
    const pos = s.lastIndexOf(':');
    const n = ipNumber(s.slice(pos + 1));
    s = s.slice(0, pos + 1) + (n >> 16n).toString(16) + ':' + (n & 65535n).toString(16);
  }
  const parts = s.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const words = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return words.reduce((n, word) => (n << 16n) + BigInt('0x' + word), 0n);
}
export function validIP(v) {
  insist(typeof v === 'string' && !!isIP(v) && !v.includes('%'), `IP 地址不正确：${String(v).slice(0, 64)}`);
  return v;
}
export function cidr(v) {
  insist(typeof v === 'string', '路由目标需要 CIDR 格式');
  const parts = v.split('/');
  const [ip, prefix] = parts;
  validIP(ip);
  const bits = isIP(ip) === 4 ? 32 : 128;
  insist(parts.length === 2 && /^(0|[1-9]\d*)$/.test(prefix ?? '') && Number(prefix) <= bits, `CIDR 不正确：${v}`);
  const n = ipNumber(ip), shift = BigInt(bits - Number(prefix));
  insist((n >> shift << shift) === n, `请使用子网地址，例如 10.10.0.0/24：${v}`);
  return { ip, prefix: Number(prefix), n, bits };
}
export function subnetDefaults(v) {
  const c = cidr(v);
  insist(c.bits === 32 && c.prefix >= 8 && c.prefix <= 30, '快速创建支持 IPv4 /8 至 /30 子网');
  const addr = n => [24n, 16n, 8n, 0n].map(s => Number(n >> s & 255n)).join('.');
  return { routes: [{ target: v, via: null }], ipAssignmentPools: [{ ipRangeStart: addr(c.n + 1n), ipRangeEnd: addr(c.n + (1n << BigInt(32 - c.prefix)) - 2n) }], v4AssignMode: { zt: true } };
}
function bool(v, key) { insist(typeof v === 'boolean', `${key}需要布尔值`); return v; }
function integer(v, key, min, max) { insist(Number.isInteger(v) && v >= min && v <= max, `${key}范围为 ${min}–${max}`); return v; }
function array(v, key, max = 128) { insist(Array.isArray(v) && v.length <= max, `${key}需要数组，最多 ${max} 项`); return v; }
function keys(v, allowed) {
  insist(object(v), '需要 JSON 对象');
  for (const k of Object.keys(v)) insist(allowed.includes(k), `不支持修改字段：${k}`);
}
export function networkPatch(v) {
  keys(v, ['name', 'private', 'enableBroadcast', 'mtu', 'multicastLimit', 'routes', 'ipAssignmentPools', 'v4AssignMode', 'v6AssignMode', 'dns']);
  const out = {};
  for (const [k, value] of Object.entries(v)) {
    if (k === 'name') out[k] = text(value, '网络名称');
    else if (['private', 'enableBroadcast'].includes(k)) out[k] = bool(value, k);
    else if (k === 'mtu') out[k] = integer(value, k, 1280, 10000);
    else if (k === 'multicastLimit') out[k] = integer(value, k, 0, 1024);
    else if (k === 'routes') out[k] = array(value, k).map(r => {
      keys(r, ['target', 'via']); const c = cidr(r.target);
      insist(r.via == null || isIP(validIP(r.via)) === isIP(c.ip), '网关和路由目标必须同为 IPv4 或 IPv6');
      return { target: r.target, via: r.via ?? null };
    });
    else if (k === 'ipAssignmentPools') out[k] = array(value, k).map(p => {
      keys(p, ['ipRangeStart', 'ipRangeEnd']); validIP(p.ipRangeStart); validIP(p.ipRangeEnd);
      insist(isIP(p.ipRangeStart) === isIP(p.ipRangeEnd) && ipNumber(p.ipRangeStart) <= ipNumber(p.ipRangeEnd), '地址池起止地址必须同类型，且起始地址不能大于结束地址');
      return { ...p };
    });
    else if (k === 'v4AssignMode' || k === 'v6AssignMode') {
      keys(value, k === 'v4AssignMode' ? ['zt'] : ['zt', 'rfc4193', '6plane']);
      out[k] = Object.fromEntries(Object.entries(value).map(([key, x]) => [key, bool(x, key)]));
    } else if (k === 'dns') {
      keys(value, ['domain', 'servers']);
      const domain = text(value.domain ?? '', 'DNS 域名', 253);
      insist(domain === '' || /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(domain), 'DNS 域名格式不正确');
      out[k] = { domain, servers: array(value.servers ?? [], 'DNS 服务器', 4).map(validIP) };
    }
  }
  return out;
}
export function memberPatch(v) {
  keys(v, ['name', 'authorized', 'activeBridge', 'noAutoAssignIps', 'ipAssignments']);
  const out = {};
  for (const [k, value] of Object.entries(v)) {
    out[k] = k === 'name' ? text(value, '成员名称') : k === 'ipAssignments' ? [...new Set(array(value, k, 16).map(validIP))] : bool(value, k);
  }
  return out;
}
