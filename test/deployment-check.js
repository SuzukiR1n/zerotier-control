// Linux/Docker integration assertions. Never log backup contents or credentials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseConfig } from '../scripts/deploy-config.js';
import { isPasswordHash, matches } from '../server/account.js';

const config = parseConfig(await readFile('.env', 'utf8'));
const downloads = await readFile('.download.env', 'utf8');
assert.ok(downloads.includes('DOCKER_REGISTRY=127.0.0.1:5000'));
assert.ok(downloads.includes('DOCKER_REGISTRY_FALLBACKS=127.0.0.1:5000'));
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
assert.equal(await readFile(`${dir}/.download.env`, 'utf8'), downloads);
assert.equal(backupConfig.PUBLIC_ORIGIN, config.PUBLIC_ORIGIN);
const oldCredentials = JSON.parse(await readFile('/tmp/zt-control-ci/before-reset-account.json', 'utf8'));
const savedAccount = JSON.parse(await readFile(`${dir}/web-data/admin-account.json`, 'utf8'));
const liveAccount = JSON.parse(execFileSync('docker', [...compose, 'exec', '-T', 'control', 'cat', '/app/data/admin-account.json'], { encoding: 'utf8' }));
assert.equal(savedAccount.username, oldCredentials.username);
assert.equal(savedAccount.mustChangeCredentials, false);
assert.ok(await matches(oldCredentials.password, savedAccount.passwordHash));
assert.equal(liveAccount.username, 'ci-recovered');
assert.equal(liveAccount.mustChangeCredentials, false);
assert.notEqual(savedAccount.passwordHash, liveAccount.passwordHash);
const seedHash = (await readFile(config.ADMIN_PASSWORD_PATH, 'utf8')).trim();
assert.ok(isPasswordHash(seedHash)); assert.ok(await matches('admin', seedHash));
assert.ok(isPasswordHash((await readFile(`${dir}/admin-password`, 'utf8')).trim()));
const rejected = await fetch('http://127.0.0.1:8080/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(oldCredentials) });
assert.equal(rejected.status, 401);
console.log('Installer configuration, exported Planet, complete key/account backup and forced credential reset passed.');
