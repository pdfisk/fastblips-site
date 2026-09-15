// Button: a clickable, labelled widget.

import { Widget } from './widget.js';

const STYLE = `
.cr-button{box-sizing:border-box;border:1px solid transparent;border-radius:4px;
  background:transparent;color:inherit;font:inherit;padding:0 12px;cursor:pointer;
  white-space:nowrap}
.cr-button:hover{background:rgba(127,127,127,.2)}
.cr-button:disabled{opacity:.5;cursor:default;background:transparent}
`;

function installStyle() {
  if (document.getElementById('cr-button-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-button-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class Button extends Widget {
  /**
   * @param {string} label
   * @param {() => void} action - run when the button is clicked
   */
  constructor(label, action = () => {}) {
    super('button');
    installStyle();
    this.element.classList.add('cr-button');
    this.element.type = 'button';
    this.action = action;
    this.element.addEventListener('click', () => this.action());
    this.label = label;
  }

  get label() { return this.element.textContent; }
  set label(text) { this.element.textContent = text; }

  get enabled() { return !this.element.disabled; }
  set enabled(value) { this.element.disabled = !value; }

  preferredWidth() {
    // Measure without the width a previous layout imposed.
    const saved = this.element.style.width;
    this.element.style.width = '';
    const w = Math.ceil(this.element.scrollWidth) + 2;
    this.element.style.width = saved;
    return w;
  }
}
