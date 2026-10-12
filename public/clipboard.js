// Copy from a user click in HTTPS and ordinary HTTP deployments.
export async function copyText(value, { navigator: nav = globalThis.navigator, document: doc = globalThis.document } = {}) {
  const text = String(value ?? '');
  try {
    if (typeof nav?.clipboard?.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch { /* The browser may reject clipboard permission; try selection copying. */ }

  const previous = doc.activeElement;
  const selection = doc.getSelection?.();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const input = doc.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.className = 'clipboard-helper';
  input.setAttribute('aria-hidden', 'true');
  // A modal dialog makes elements outside it inert, including a body-level input.
  const host = doc.querySelector('dialog[open]') || doc.body;
  try {
    host.append(input);
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, text.length);
    return typeof doc.execCommand === 'function' && doc.execCommand('copy') === true;
  } catch { return false; }
  finally {
    input.remove();
    previous?.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
