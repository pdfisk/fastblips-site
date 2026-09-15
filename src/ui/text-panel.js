// TextPanel: a Panel containing a single text area that fills its entire
// area (see docs/widgets.txt).

import { Panel } from './panel.js';

export class TextPanel extends Panel {
  /** @param {{text?: string, readOnly?: boolean}} options */
  constructor({ text = '', readOnly = false } = {}) {
    super();
    this.element.classList.add('cr-text-panel');
    this.textArea = document.createElement('textarea');
    this.textArea.spellcheck = false;
    this.textArea.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
      + 'box-sizing:border-box;margin:0;border:0;outline:0;resize:none;padding:6px 8px;'
      + 'font:13px/1.4 ui-monospace,Consolas,monospace;background:#fff;color:#111';
    this.textArea.addEventListener('input', () => {
      this.element.dispatchEvent(new CustomEvent('change', { detail: { text: this.text } }));
    });
    this.element.appendChild(this.textArea);
    this.text = text;
    this.readOnly = readOnly;
  }

  get text() { return this.textArea.value; }
  set text(value) { this.textArea.value = String(value); }

  get readOnly() { return this.textArea.readOnly; }
  set readOnly(value) { this.textArea.readOnly = Boolean(value); }

  /** Appends text at the end and scrolls it into view. */
  append(value) {
    this.textArea.value += String(value);
    this.textArea.scrollTop = this.textArea.scrollHeight;
  }

  /** A TextPanel holds only its text area. */
  add() {
    throw new Error('TextPanel cannot contain other widgets');
  }
}
