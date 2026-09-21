// Label: a line of text, e.g. a status message at the end of a ButtonBar.

import { Widget } from './widget.js';

export class Label extends Widget {
  constructor(text = '') {
    super('span');
    this.element.classList.add('cr-label');
    this.element.style.cssText += ';display:flex;align-items:center;white-space:nowrap;'
      + 'overflow:hidden;text-overflow:ellipsis;padding:0 6px;color:var(--cr-text-muted)';
    this.text = text;
  }

  get text() { return this.element.textContent; }
  set text(value) { this.element.textContent = String(value); }

  /** 'error' shows the text in red; anything else in the normal colour. */
  set tone(tone) { this.element.style.color = tone === 'error' ? 'var(--cr-danger)' : 'var(--cr-text-muted)'; }

  preferredWidth() {
    const saved = this.element.style.width;
    this.element.style.width = '';
    const w = Math.ceil(this.element.scrollWidth) + 2;
    this.element.style.width = saved;
    return w;
  }
}
