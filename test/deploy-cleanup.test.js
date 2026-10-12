import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupPaths, cleanupPlan, removeProjectData } from '../scripts/deploy-cleanup.js';

const project = 'cleanup-test', hostRoot = '/srv/zerotier-control';
const configuration = () => ({ name: project, volumes: { 'zerotier-data': { name: `${project}_zerotier-data` }, 'control-data': { name: `${project}_control-data` } }, services: {
  controller: { volumes: [{ type: 'volume', source: 'zerotier-data', target: '/var/lib/zerotier-one' }] },
  control: { volumes: [{ type: 'volume', source: 'control-data', target: '/app/data' }, { type: 'bind', source: `${hostRoot}/secrets/admin-password`, target: '/run/secrets/admin-password' }] },
  gateway: { volumes: [{ type: 'bind', source: `${hostRoot}/deploy/nginx.conf`, target: '/etc/nginx/conf.d/default.conf' }] }
} });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zt-cleanup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['data', 'backups', 'secrets']) { await mkdir(join(root, name)); await writeFile(join(root, name, 'test-data'), 'discardable test data'); }
  for (const name of ['.env', '.download.env', 'README.md']) await writeFile(join(root, name), 'test fixture');
  return root;
}
const exists = path => lstat(path).then(() => true).catch(e => { if (e.code !== 'ENOENT') throw e; return false; });

test('cleanup plan includes credentials, exported Planet and backups, and removes only fixed project data paths', async t => {
  const root = await fixture(t);
  const plan = await cleanupPlan(root, configuration(), project, hostRoot);
  assert.deepEqual(plan.paths, [...cleanupPaths]);
  assert.deepEqual(plan.volumes, ['cleanup-test_control-data', 'cleanup-test_zerotier-data']);
  await removeProjectData(root);
  for (const path of cleanupPaths) assert.equal(await exists(join(root, path)), false);
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), 'test fixture');
  await removeProjectData(root);
});

test('cleanup refuses external volumes, mismatched projects and host mounts outside its declared paths', async t => {
  const root = await fixture(t);
  for (const change of [
    c => { c.name = 'another-project'; },
    c => { c.volumes['control-data'].external = true; },
    c => { c.volumes['control-data'].name = '--invalid'; },
    c => { c.services.control.volumes[0].source = 'unknown-volume'; },
    c => { c.services.control.volumes[1].source = '/srv/another-project/password'; },
    c => { c.services.controller.volumes = [{ type: 'bind', source: `${hostRoot}/other-data`, target: '/var/lib/zerotier-one' }]; },
    c => { c.services.control.volumes[1].source = `${hostRoot}/data/../../outside`; },
    c => { c.secrets = { account: { file: '/outside/password' } }; }
  ]) {
    const c = configuration(); change(c);
    await assert.rejects(cleanupPlan(root, c, project, hostRoot));
    assert.equal(await readFile(join(root, 'data/test-data'), 'utf8'), 'discardable test data');
  }
  await assert.rejects(cleanupPlan(root, configuration(), project, '/'));
});

test('cleanup accepts project-local bind data and refuses top-level symlinks before any deletion', async t => {
  const root = await fixture(t);
  const c = configuration();
  c.services.controller.volumes = [{ type: 'bind', source: `${hostRoot}/data/zerotier`, target: '/var/lib/zerotier-one' }];
  await cleanupPlan(root, c, project, hostRoot);
  if (process.platform === 'win32') return;
  const outside = await mkdtemp(join(tmpdir(), 'zt-cleanup-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'sentinel'), 'keep this data');
  await symlink(join(outside, 'sentinel'), join(root, 'secrets/admin-password'));
  await assert.rejects(cleanupPlan(root, c, project, hostRoot), /符号链接/);
  await rm(join(root, 'secrets/admin-password'));
  await rm(join(root, 'backups'), { recursive: true });
  await symlink(outside, join(root, 'backups'));
  await assert.rejects(cleanupPlan(root, c, project, hostRoot), /符号链接/);
  await assert.rejects(removeProjectData(root), /符号链接/);
  assert.equal(await readFile(join(root, 'data/test-data'), 'utf8'), 'discardable test data');
  assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'keep this data');
  await rm(join(root, 'backups'));
  await symlink(outside, join(root, 'data/outside-link'));
  await removeProjectData(root);
  assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'keep this data');
});
