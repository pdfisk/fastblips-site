// TextArea: several lines of text the user can edit (see docs/widgets.txt).
// Modelled on qooxdoo's qx.ui.form.TextArea. It is a TextField with more
// than one line, on a <textarea>: a placeholder, a limit on the length, read
// only, enabled, and wrap (whether long lines wrap or run off to the side).
// A TextPanel is the older Panel that holds a text area; a TextArea is a
// widget of its own.
//
// It fires the browser's input event on every edit by the user (not when the
// program sets the text), and a submit event (a CustomEvent) on Ctrl+Enter or
// Cmd+Enter: Enter on its own is a new line.

import { TextInput } from './text-field.js';

const STYLE = `
.cr-text-area{padding:6px 8px;resize:none;line-height:1.4;font:var(--cr-font-size)/1.4 var(--cr-font-code)}
`;

function installStyle() {
  if (document.getElementById('cr-text-area-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-text-area-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class TextArea extends TextInput {
  /** @param {string} [text] - what it holds at first */
  constructor(text = '') {
    super('textarea', text);
    installStyle();
    this.element.classList.add('cr-text-area');
    this._wrap = true;
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.element.dispatchEvent(new CustomEvent('submit'));
      }
    });
  }

  /** True when long lines wrap; false when they run off to the side (and it scrolls). */
  get wrap() { return this._wrap; }
  set wrap(value) {
    this._wrap = Boolean(value);
    this.element.wrap = this._wrap ? 'soft' : 'off';
    this.element.style.whiteSpace = this._wrap ? '' : 'pre';
    this.element.style.overflowX = this._wrap ? '' : 'auto';
  }

  /** Adds text at the end and scrolls it into view. */
  append(value) {
    this.element.value += String(value);
    this.element.scrollTop = this.element.scrollHeight;
  }
}
