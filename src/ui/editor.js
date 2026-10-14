import { $ } from './dom.js';

/**
 * Side panel for curating a single frame. Emits intent via callbacks and
 * leaves the actual work to the caller (the curator).
 */
export class EditorPanel {
  /**
   * @param {{ onUpload(file: File): Promise<void>, onShuffle(): Promise<void>,
   *           onReset(): Promise<void>, onFit(fit: string): Promise<void>, onClose(): void }} handlers
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.el = $('editor');
    this.title = $('editorTitle');
    this.meta = $('editorMeta');
    this.status = $('editorStatus');
    this.fileInput = $('mediaInput');
    this.fitButtons = [...this.el.querySelectorAll('[data-fit]')];
    this.resetButton = $('resetFrame');
    this.frame = null;

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) this.run(() => handlers.onUpload(file), `Uploaded “${file.name}” to the museum bucket.`);
    });
    $('shuffleFrame').addEventListener('click', () => this.run(handlers.onShuffle, 'New piece hung.'));
    this.resetButton.addEventListener('click', () => this.run(handlers.onReset, 'Upload removed.'));
    for (const button of this.fitButtons) {
      button.addEventListener('click', () => this.run(() => handlers.onFit(button.dataset.fit)));
    }
    $('closeEditor').addEventListener('click', () => handlers.onClose());
  }

  setStatus(text) { this.status.textContent = text; }

  get isOpen() { return this.el.classList.contains('open'); }

  open(frame) {
    this.frame = frame;
    this.status.textContent = 'Uploads go to the museum’s R2 bucket (upload key needed).';
    this.refresh();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.frame = null;
  }

  refresh() {
    const frame = this.frame;
    if (!frame) return;
    this.title.textContent = frame.item?.title ?? 'Empty frame';
    const source = { upload: 'Your upload', collection: 'From the collection', fallback: 'Placeholder' }[frame.item?.source] ?? '';
    this.meta.textContent = `${frame.slot.id} · ${source}`;
    this.resetButton.hidden = frame.item?.source !== 'upload';
    for (const b of this.fitButtons) b.classList.toggle('selected', b.dataset.fit === frame.fit);
  }

  async run(action, success) {
    this.el.classList.add('busy');
    try {
      await action();
      if (success) this.status.textContent = success;
    } catch (err) {
      console.error(err);
      this.status.textContent = err.message || 'Something went wrong.';
    } finally {
      this.el.classList.remove('busy');
      this.refresh();
    }
  }
}
