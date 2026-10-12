import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../public/clipboard.js';

function documentFixture({ modal = false, denied = false } = {}) {
  const state = { attached: null, copied: null, removed: false, restored: false };
  const input = { value: '', setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() { state.removed = true; } };
  const body = { append(el) { state.attached = 'body'; assert.equal(el, input); } };
  const dialog = { append(el) { state.attached = 'dialog'; assert.equal(el, input); } };
  const document = {
    activeElement: { focus() { state.restored = true; } }, body,
    querySelector() { return modal ? dialog : null; },
    createElement() { return input; },
    execCommand(command) {
      assert.equal(command, 'copy');
      if (denied) return false;
      state.copied = input.value;
      return true;
    },
  };
  return { document, state };
}

test('modern clipboard copies the exact value without requiring a DOM fallback', async () => {
  let copied;
  assert.equal(await copyText('a1b2c3d4e5abcdef', { navigator: { clipboard: { async writeText(value) { copied = value; } } }, document: null }), true);
  assert.equal(copied, 'a1b2c3d4e5abcdef');
});
test('HTTP without navigator.clipboard copies through selection and restores focus', async () => {
  const f = documentFixture();
  assert.equal(await copyText('zerotier-cli join a1b2c3d4e5abcdef', { navigator: {}, document: f.document }), true);
  assert.equal(f.state.copied, 'zerotier-cli join a1b2c3d4e5abcdef');
  assert.equal(f.state.attached, 'body'); assert.ok(f.state.removed && f.state.restored);
});
test('rejected clipboard permission falls back inside the active modal dialog', async () => {
  const f = documentFixture({ modal: true });
  assert.equal(await copyText('a1b2c3d4e5abcdef', { navigator: { clipboard: { async writeText() { throw new Error('permission denied'); } } }, document: f.document }), true);
  assert.equal(f.state.attached, 'dialog'); assert.equal(f.state.copied, 'a1b2c3d4e5abcdef');
  assert.ok(f.state.removed && f.state.restored);
});
test('blocked selection copy returns failure for manual copying instead of a false success', async () => {
  const f = documentFixture({ denied: true });
  assert.equal(await copyText('a1b2c3d4e5abcdef', { navigator: {}, document: f.document }), false);
  assert.equal(f.state.copied, null); assert.ok(f.state.removed && f.state.restored);
});
