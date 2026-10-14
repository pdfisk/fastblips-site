// ScriptEditWindow: a window for editing one script of the database server -
// its name and its source - opened by Edit in the Projects window's Scripts
// menu. It loads the script by id, and Save writes it back (the compiled code
// is dropped when the source changed, as it would no longer match).

import { Window } from './window.js';
import { RecordPanel } from '../widgets/record-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';

// Monaco language by the language a script is saved with.
const MONACO = { basic: 'vb', python: 'python' };

export class ScriptEditWindow extends Window {
  /**
   * @param {object} options
   * @param {object} options.store - the SourceStore for scripts
   * @param {number} options.id - the script to edit
   * @param {string} [options.name] - its name, for the title until it loads
   * @param {string} [options.language] - 'basic' or 'python'
   * @param {(script: object) => void} [options.onSave] - called with the saved record
   */
  constructor({ store, id, name = '', language = 'basic', onSave = () => {}, ...options } = {}) {
    super({
      title: `Edit ${name || 'Script'}`,
      x: 230, y: 120, width: 560, height: 380, minWidth: 320, minHeight: 200,
      ...options,
    });
    this.element.classList.add('cr-script-edit-window');
    this.store = store;
    this.id = id;
    this.onSave = onSave;
    this.current = null;   // the record as last loaded or saved

    this.recordPanel = new RecordPanel({ language: MONACO[language] ?? 'plaintext' });
    this.content = this.recordPanel;
    this.saveButton = this.buttonBar.addButton('Save', () => this.save());
    this.buttonBar.addButton('Close', () => this.close());
    this.buttonBar.add(new Spacer());
    this.status = this.buttonBar.add(new Label());

    this.recordPanel.element.addEventListener('change', () => this.updateButtons());
    this.recordPanel.element.addEventListener('submit', () => this.save());
    this.element.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
    });
    this.updateButtons();
  }

  /** True when the name or source differs from what was loaded or saved. */
  get dirty() {
    return Boolean(this.current)
      && (this.recordPanel.name !== (this.current.name ?? '')
        || this.recordPanel.content !== (this.current.content ?? ''));
  }

  open(viewport) {
    const wasOpen = this.isOpen;
    super.open(viewport);
    if (!wasOpen) this.load();
    return this;
  }

  /** Closing with unsaved changes asks first. */
  close() {
    if (this.dirty && !confirm(`Discard unsaved changes to "${this.recordPanel.name}"?`)) return false;
    return super.close();
  }

  async load() {
    this.setStatus('Loading…');
    try {
      this._show(await this.store.get(this.id));
      this.setStatus(`#${this.current.id}`);
    } catch (e) {
      this.setStatus(e.message, 'error');
    }
  }

  async save() {
    if (!this.current) return null;
    const name = this.recordPanel.name.trim();
    if (!name) { this.setStatus('A name is required', 'error'); this.recordPanel.focusName(); return null; }
    const fields = { name, content: this.recordPanel.content };
    if (fields.content !== (this.current.content ?? '')) fields.compiled_code = null;
    this.setStatus('Saving…');
    try {
      const saved = await this.store.update(this.id, fields);
      this._show(saved);
      this.setStatus(`Saved "${saved.name}"`);
      this.onSave(saved);
      return saved;
    } catch (e) {
      this.setStatus(e.message, 'error');
      return null;
    }
  }

  setStatus(text, tone) {
    this.status.text = text;
    this.status.tone = tone;
    this.status.element.title = text;
    this.buttonBar.layout();
  }

  updateButtons() {
    this.saveButton.enabled = this.dirty;
    this.buttonBar.layout();
  }

  _show(record) {
    this.current = { ...record };
    this.recordPanel.name = record.name ?? '';
    this.recordPanel.content = record.content ?? '';
    this.recordPanel.enabled = true;
    this.title = `Edit ${record.name ?? 'Script'}`;
    this.updateButtons();
  }
}
