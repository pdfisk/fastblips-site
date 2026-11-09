// CheckBox: a box that is ticked or not, with a label (see docs/widgets.txt).
// Modelled on qooxdoo's qx.ui.form.CheckBox. Clicking the label ticks it too.
// It fires a change event (a CustomEvent) with detail { checked } when the
// user ticks or clears it (not when the program sets checked).

import { Widget } from './widget.js';

const STYLE = `
.cr-check-box{display:flex;align-items:center;gap:6px;box-sizing:border-box;white-space:nowrap;
  font:var(--cr-font-size) var(--cr-font-ui);color:var(--cr-text);cursor:pointer;user-select:none}
.cr-check-box input{margin:0;accent-color:var(--cr-accent);cursor:inherit}
.cr-check-box.cr-disabled{opacity:.55;cursor:default}
`;

function installStyle() {
  if (document.getElementById('cr-check-box-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-check-box-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class CheckBox extends Widget {
  /** @param {string} [label] @param {boolean} [checked] */
  constructor(label = '', checked = false) {
    super('label');
    installStyle();
    this.element.classList.add('cr-check-box');
    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.text = document.createElement('span');
    this.element.append(this.input, this.text);
    this.input.addEventListener('change', () => {
      this.element.dispatchEvent(new CustomEvent('change', { detail: { checked: this.checked } }));
    });
    this.label = label;
    this.checked = checked;
  }

  get label() { return this.text.textContent; }
  set label(value) { this.text.textContent = String(value ?? ''); }

  get checked() { return this.input.checked; }
  set checked(value) { this.input.checked = Boolean(value); }

  get enabled() { return !this.input.disabled; }
  set enabled(value) {
    this.input.disabled = !value;
    this.element.classList.toggle('cr-disabled', !value);
  }

  preferredWidth() {
    const saved = this.element.style.width;
    this.element.style.width = '';
    const w = Math.ceil(this.element.scrollWidth) + 2;
    this.element.style.width = saved;
    return w;
  }
}
