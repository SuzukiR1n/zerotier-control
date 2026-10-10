import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const scrypt = promisify(scryptCallback);
const hashPattern = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/;
export const isPasswordHash = value => typeof value === 'string' && hashPattern.test(value);
export const validUsername = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(value);
export const validPassword = value => typeof value === 'string' && value.trim().length >= 12 && value.length <= 256;
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function matches(password, hash) {
  const [, salt, digest] = hash.split(':');
  return timingSafeEqual(await scrypt(password, salt, 64), Buffer.from(digest, 'hex'));
}
async function saveAccount(dataDir, account) {
  if (!dataDir) return;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, 'admin-account.json');
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(account) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
async function initialAccount(config) {
  let hash = config.passwordHash;
  if (!hash) {
    const seed = config.passwordFile ? (await readFile(config.passwordFile, 'utf8')).trim() : 'admin';
    if (isPasswordHash(seed)) hash = seed;
    else {
      if (seed !== 'admin' && !validPassword(seed)) throw new Error('��ʼ�������Ϊ admin �� 12�C256 ���ַ�');
      hash = await passwordHash(seed);
    }
  }
  if (!hashPattern.test(hash)) throw new Error('ADMIN_PASSWORD_HASH ��ʽ��Ч');
  return { format: 'zerotier-control-account-v1', username: 'admin', passwordHash: hash, mustChangeCredentials: true };
}
export async function resetAccount(dataDir) {
  if (!dataDir) throw new Error('�����˺���Ҫ DATA_DIR');
  await saveAccount(dataDir, await initialAccount({}));
}
export async function accountStore(config) {
  let current;
  if (config.dataDir) {
    const path = join(config.dataDir, 'admin-account.json');
    const saved = await readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (saved !== null) {
      try { current = JSON.parse(saved); } catch { throw new Error('����Ա�˺��ļ��𻵣���ʹ�ò���ű������˺�'); }
      if (current?.format !== 'zerotier-control-account-v1' || !validUsername(current.username) || !hashPattern.test(current.passwordHash) || typeof current.mustChangeCredentials !== 'boolean') throw new Error('����Ա�˺��ļ���ʽ��Ч����ʹ�ò���ű������˺�');
      await chmod(path, 0o600);
    }
  }
  if (!current) { current = await initialAccount(config); await saveAccount(config.dataDir, current); }
  let pending = Promise.resolve();
  return {
    get current() { return current; },
    update(change) {
      const task = pending.then(async () => {
        const next = await change(current);
        await saveAccount(config.dataDir, next);
        current = next;
        return next;
      });
      pending = task.catch(() => {});
      return task;
    }
  };
}
