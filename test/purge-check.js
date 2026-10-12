// Isolated Linux/Docker CI deployment only. Never log identities, credentials or backup contents.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cleanupPaths } from '../scripts/deploy-cleanup.js';

const project = 'control-ci', unrelated = 'zt-control-ci-unrelated-data';
const stateFile = '/tmp/zt-control-ci/purge-state.json';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const containers = () => docker('ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.ID}}');
const volumes = () => docker('volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Name}}');
const cli = () => JSON.parse(docker('compose', '-p', project, '-f', 'compose.yaml', '-f', 'deploy/compose.ci.yaml', 'exec', '-T', 'controller', 'zerotier-cli', '-j', 'info'));
if (process.argv.includes('--before')) {
  const state = JSON.parse(await readFile('/tmp/zt-control-ci/state.json', 'utf8'));
  assert.ok(containers()); assert.ok(volumes());
  for (const path of cleanupPaths) assert.ok(await lstat(path));
  docker('volume', 'create', '--label', 'com.docker.compose.project=unrelated-ci', unrelated);
  await writeFile(stateFile, JSON.stringify({ address: state.address, sha256: state.sha256, containers: containers(), volumes: volumes() }), { mode: 0o600 });
} else if (process.argv.includes('--after-rejected')) {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(containers(), state.containers); assert.equal(volumes(), state.volumes);
  for (const path of cleanupPaths) assert.ok(await lstat(path));
  console.log('Incorrect deletion confirmation preserved containers, volumes and every project data path.');
} else if (process.argv.includes('--after')) {
  assert.equal(containers(), ''); assert.equal(volumes(), '');
  for (const path of cleanupPaths) await assert.rejects(lstat(path), e => e.code === 'ENOENT');
  assert.ok(await lstat('deploy.sh')); assert.ok(await lstat('README.md'));
  assert.equal(docker('volume', 'inspect', '--format', '{{.Name}}', unrelated), unrelated);
  docker('volume', 'rm', unrelated);
  console.log('Complete uninstall removed current-project containers, all volumes, exports, credentials, configuration and backups; unrelated volume survived.');
} else if (process.argv.includes('--after-reinstall')) {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.notEqual(cli().address, state.address);
  assert.notEqual(createHash('sha256').update(await readFile('data/zerotier/dist/planet')).digest('hex'), state.sha256);
  const response = await fetch('http://127.0.0.1:8080/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mustChangeCredentials, true);
  console.log('Reinstall after complete deletion created a new controller identity/Planet and required changing the default admin credentials.');
} else throw new Error('Missing CI assertion stage');
