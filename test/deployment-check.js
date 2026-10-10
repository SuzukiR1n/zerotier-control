// Linux/Docker integration assertions. Never log backup contents or credentials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseConfig } from '../scripts/deploy-config.js';

const config = parseConfig(await readFile('.env', 'utf8'));
const state = JSON.parse(await readFile('/tmp/zt-control-ci/state.json', 'utf8'));
assert.equal(config.COMPOSE_PROJECT_NAME, 'control-ci');
assert.equal((await stat('.env')).mode & 0o777, 0o600);
assert.equal((await stat(config.ADMIN_PASSWORD_PATH)).mode & 0o777, 0o600);
const planet = await readFile('data/zerotier/dist/planet');
assert.equal(createHash('sha256').update(planet).digest('hex'), state.sha256);
const compose = ['compose', '-p', 'control-ci', '-f', 'compose.yaml', '-f', 'deploy/compose.ci.yaml'];
const backups = (await readdir('backups', { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
assert.ok(backups.length >= 1, 'Update must produce a full backup');
const dir = `backups/${backups.at(-1)}`;
assert.equal((await stat(dir)).mode & 0o777, 0o700);
for (const file of ['identity.secret', 'current.c25519', 'previous.c25519', 'planet']) {
  const live = execFileSync('docker', [...compose, 'exec', '-T', 'controller', 'cat', `/var/lib/zerotier-one/${file}`]);
  const saved = await readFile(`${dir}/zerotier-one/${file}`);
  assert.ok(live.equals(saved), `Backup did not preserve ${file}`);
}
const backupConfig = parseConfig(await readFile(`${dir}/.env`, 'utf8'));
assert.equal(backupConfig.PUBLIC_ORIGIN, config.PUBLIC_ORIGIN);
const oldPassword = (await readFile(`${dir}/admin-password`, 'utf8')).trim();
const currentPassword = (await readFile(config.ADMIN_PASSWORD_PATH, 'utf8')).trim();
assert.notEqual(createHash('sha256').update(oldPassword).digest('hex'), createHash('sha256').update(currentPassword).digest('hex'), 'Password reset must replace the old password');
const rejected = await fetch('http://127.0.0.1:8080/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: oldPassword }) });
assert.equal(rejected.status, 401);
console.log('Installer configuration, exported Planet, complete key backup and password reset passed.');
