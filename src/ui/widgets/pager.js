// Pager: moves through the pages of a long list - « ‹ Page 2 of 5 › » - for
// a list the server sends a page at a time (see docs/widgets.txt).
//
// Set page and totalPages to show where the list is; when the user picks
// another page the Pager fires a change event (a CustomEvent) with detail
// { page }, and the owner fetches that page and sets page. The buttons are
// greyed out where there is nowhere to go.

import { Widget } from './widget.js';

const STYLE = `
.cr-pager{display:flex;align-items:center;gap:2px;box-sizing:border-box;white-space:nowrap;
  font:var(--cr-font-size-small) var(--cr-font-ui);color:var(--cr-text-muted)}
.cr-pager button{border:1px solid transparent;background:transparent;color:inherit;font:inherit;
  min-width:22px;height:22px;padding:0 4px;border-radius:var(--cr-radius-button);cursor:pointer}
.cr-pager button:hover:not(:disabled){background:var(--cr-button-hover);color:var(--cr-text)}
.cr-pager button:disabled{opacity:.35;cursor:default}
.cr-pager-label{padding:0 6px}
`;

function installStyle() {
  if (document.getElementById('cr-pager-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-pager-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class Pager extends Widget {
  /** @param {{page?: number, totalPages?: number}} [options] */
  constructor({ page = 1, totalPages = 1 } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-pager');
    this.element.setAttribute('role', 'navigation');
    this.element.setAttribute('aria-label', 'Pages');
    const button = (text, label, to) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => this.go(to()));
      return b;
    };
    this.firstButton = button('«', 'First page', () => 1);
    this.prevButton = button('‹', 'Previous page', () => this._page - 1);
    this.label = document.createElement('span');
    this.label.className = 'cr-pager-label';
    this.nextButton = button('›', 'Next page', () => this._page + 1);
    this.lastButton = button('»', 'Last page', () => this._total);
    this.element.append(this.firstButton, this.prevButton, this.label, this.nextButton, this.lastButton);
    this._page = 1;
    this._total = 1;
    this.set(page, totalPages);
  }

  get page() { return this._page; }
  set page(n) { this.set(n, this._total); }

  get totalPages() { return this._total; }
  set totalPages(n) { this.set(this._page, n); }

  /** Shows page of totalPages, without firing change. */
  set(page, totalPages) {
    this._total = Math.max(1, Math.floor(Number(totalPages) || 1));
    this._page = Math.min(this._total, Math.max(1, Math.floor(Number(page) || 1)));
    this.label.textContent = `Page ${this._page} of ${this._total}`;
    this.firstButton.disabled = this.prevButton.disabled = this._page <= 1;
    this.nextButton.disabled = this.lastButton.disabled = this._page >= this._total;
  }

  /** Goes to page n (if it is another page) and fires change. */
  go(n) {
    const page = Math.min(this._total, Math.max(1, n));
    if (page === this._page) return;
    this.set(page, this._total);
    this.element.dispatchEvent(new CustomEvent('change', { detail: { page } }));
  }

  preferredWidth() {
    const saved = this.element.style.width;
    this.element.style.width = '';
    const w = Math.ceil(this.element.scrollWidth) + 2;
    this.element.style.width = saved;
    return w;
  }
}
