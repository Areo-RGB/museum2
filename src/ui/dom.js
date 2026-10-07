/** Tiny helper so UI modules fail loudly if markup and code drift apart. */
export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  return el;
}
