import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { HttpError } from './validation.js';

export async function planetFiles(directory) {
  if (!directory) return { available: false };
  try {
    const path = join(directory, 'planet');
    const [size, metadataSize] = await Promise.all([stat(path), stat(join(directory, 'planet.json'))]);
    if (size.size < 100 || size.size > 65536 || metadataSize.size > 65536) throw new Error('Invalid size');
    const [bytes, raw] = await Promise.all([readFile(path), readFile(join(directory, 'planet.json'), 'utf8')]);
    const data = JSON.parse(raw);
    if (bytes[0] !== 1 || !Array.isArray(data.roots)) throw new Error('Invalid format');
    // Explicitly select public fields. No private keys or arbitrary files are exposed.
    const roots = data.roots.map(r => ({ identity: r.identity, stableEndpoints: r.stableEndpoints }));
    if (roots.some(r => typeof r.identity !== 'string' || !/^[0-9a-f]{10}:0:[0-9a-f]+$/i.test(r.identity) || !Array.isArray(r.stableEndpoints))) throw new Error('Invalid public metadata');
    return { available: true, worldId: data.worldId, timestamp: data.timestamp, zerotierVersion: data.zerotierVersion, roots, bytes, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch { throw new HttpError(503, 'Planet 文件尚未准备好，请检查控制器启动日志'); }
}
