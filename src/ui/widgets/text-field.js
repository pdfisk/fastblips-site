// TextField and PasswordField: a single line of text the user can edit (see
// docs/widgets.txt). Modelled on qooxdoo's qx.ui.form.TextField and
// PasswordField. TextInput is what they share with TextArea (text-area.js),
// the box of several lines.
//
// The widget is an <input>. It fires the browser's own input event on every
// edit by the user (not when the program sets the text), and a submit event
// (a CustomEvent) when the user presses Enter.
//
// A PasswordField shows dots instead of its text. Its text is for the
// program that asked for it: it is never saved (see program-widgets.js), and
// the browser is told not to fill in a saved password.

import { Widget } from './widget.js';

const STYLE = `
.cr-text-field{box-sizing:border-box;margin:0;padding:0 8px;outline:0;
  border:1px solid var(--cr-divider);border-radius:var(--cr-radius-button);
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-ui)}
.cr-text-field:focus{border-color:var(--cr-accent)}
.cr-text-field::placeholder{color:var(--cr-text-faint)}
.cr-text-field:disabled{opacity:.6}
`;

function installStyle() {
  if (document.getElementById('cr-text-field-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-text-field-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/**
 * What a text field and a text area have in common: the text, a placeholder, a
 * limit on its length, read only, enabled, focus and select all. The element
 * is an <input> or a <textarea>, as the subclass says.
 */
export class TextInput extends Widget {
  /**
   * @param {string} tag - 'input' or 'textarea'
   * @param {string} [text] - what it holds at first
   * @param {{type?: 'text'|'password'}} [options] - the type of an <input>
   */
  constructor(tag, text = '', { type = 'text' } = {}) {
    super(tag);
    installStyle();
    this.element.classList.add('cr-text-field');
    if (tag === 'input') this.element.type = type;
    this.element.spellcheck = false;
    this.element.autocomplete = type === 'password' ? 'new-password' : 'off';
    this._maxLength = 0;
    this.text = text;
  }

  get text() { return this.element.value; }
  set text(value) { this.element.value = String(value); }

  /** Grey text shown while the field is empty. */
  get placeholder() { return this.element.placeholder ?? ''; }
  set placeholder(value) { this.element.placeholder = String(value); }

  /** The most characters the user can type; 0 for no limit. Text already there is not cut. */
  get maxLength() { return this._maxLength; }
  set maxLength(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    this._maxLength = n;
    if (n > 0) this.element.maxLength = n;
    else this.element.removeAttribute?.('maxlength');
  }

  /** True when the user can look at the text but not change it. */
  get readOnly() { return Boolean(this.element.readOnly); }
  set readOnly(value) { this.element.readOnly = Boolean(value); }

  /** False greys the field out so the user cannot use it. */
  get enabled() { return !this.element.disabled; }
  set enabled(value) { this.element.disabled = !value; }

  /** Moves the keyboard focus into the field. */
  focus() { this.element.focus(); }

  /** Selects all the text. */
  selectAll() { this.element.select(); }
}

export class TextField extends TextInput {
  /**
   * @param {string} [text] - what it holds at first
   * @param {{type?: 'text'|'password'}} [options]
   */
  constructor(text = '', options = {}) {
    super('input', text, options);
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.element.dispatchEvent(new CustomEvent('submit'));
    });
  }
}

export class PasswordField extends TextField {
  constructor() {
    super('', { type: 'password' });
    this.element.classList.add('cr-password-field');
  }
}
