// RecordPanel: the editor for one source record - a Name field and a caption
// along the top, and the content in a MonacoPanel filling the rest
// (see docs/widgets.txt). Used by DatabaseWindow.

import { Panel } from './panel.js';
import { MonacoPanel } from './monaco-panel.js';

export const RECORD_HEADER_HEIGHT = 32;

const STYLE = `
.cr-record-header{position:absolute;left:0;top:0;right:0;height:${RECORD_HEADER_HEIGHT}px;
  box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:0 8px;
  background:var(--cr-header-bg);border-bottom:1px solid var(--cr-divider)}
.cr-record-header label{color:var(--cr-header-text)}
.cr-record-name{flex:1;min-width:60px;height:22px;box-sizing:border-box;padding:0 6px;
  border:1px solid var(--cr-field-border);border-radius:var(--cr-radius-field);
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-code)}
.cr-record-name:disabled{background:var(--cr-field-disabled-bg)}
.cr-record-info{color:var(--cr-header-info);font-size:var(--cr-font-size-small);white-space:nowrap}
`;

function installStyle() {
  if (document.getElementById('cr-record-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-record-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class RecordPanel extends Panel {
  /** @param {{language?: string}} options - Monaco language of the content */
  constructor({ language = 'plaintext' } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-record-panel');

    this.header = document.createElement('div');
    this.header.className = 'cr-record-header';
    const label = document.createElement('label');
    label.textContent = 'Name';
    this.nameInput = document.createElement('input');
    this.nameInput.className = 'cr-record-name';
    this.nameInput.spellcheck = false;
    label.htmlFor = this.nameInput.id = `cr-record-name-${Math.random().toString(36).slice(2)}`;
    this.info = document.createElement('span');
    this.info.className = 'cr-record-info';
    this.header.append(label, this.nameInput, this.info);
    this.element.appendChild(this.header);

    this.contentPanel = new MonacoPanel({ language });
    super.add(this.contentPanel);

    // One 'change' event for edits to either field.
    this.nameInput.addEventListener('input', () => this._changed());
    this.contentPanel.element.addEventListener('change', (e) => { e.stopPropagation(); this._changed(); });
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.element.dispatchEvent(new CustomEvent('submit')); }
    });
    this.contentPanel.element.addEventListener('submit', (e) => {
      e.stopPropagation();
      this.element.dispatchEvent(new CustomEvent('submit'));
    });
    this.enabled = false;
  }

  get name() { return this.nameInput.value; }
  set name(value) { this.nameInput.value = value ?? ''; }

  get content() { return this.contentPanel.text; }
  set content(value) {
    this._quiet = true;   // setting the text is not a user edit
    try { this.contentPanel.text = value ?? ''; } finally { this._quiet = false; }
  }

  /** Caption shown to the right of the name, e.g. '#3 · saved 10:42'. */
  set caption(text) { this.info.textContent = text; }

  /** A disabled panel shows its fields but they cannot be edited. */
  get enabled() { return !this.nameInput.disabled; }
  set enabled(value) {
    this.nameInput.disabled = !value;
    this.contentPanel.readOnly = !value;
  }

  focusName() { this.nameInput.focus(); this.nameInput.select(); }

  /** A RecordPanel holds only its own fields. */
  add() { throw new Error('RecordPanel cannot contain other widgets'); }

  layout() {
    const { width, height } = this.bounds;
    this.contentPanel.setBounds(0, RECORD_HEADER_HEIGHT, width, Math.max(0, height - RECORD_HEADER_HEIGHT));
    super.layout();
  }

  _changed() {
    if (this._quiet) return;
    this.element.dispatchEvent(new CustomEvent('change'));
  }
}
