// ListPanel: a Panel filled by a single list (see docs/widgets.txt).
//
// Items are { label, value } objects. The selection is tracked by value, so
// replacing the items (e.g. on a refresh) keeps the same row selected.

import { Panel } from './panel.js';

const STYLE = `
.cr-list{position:absolute;inset:0;overflow:auto;margin:0;padding:2px 0;list-style:none;
  box-sizing:border-box;outline:0;background:#fff;color:#111;
  font:13px/1.4 ui-monospace,Consolas,monospace}
.cr-list li{padding:2px 8px;white-space:pre;cursor:default}
.cr-list li[aria-selected="true"]{background:#cfe0f7}
.cr-list:focus li[aria-selected="true"]{background:#2f6fcf;color:#fff}
.cr-list-empty{color:#888;padding:6px 8px}
`;

function installStyle() {
  if (document.getElementById('cr-list-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-list-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class ListPanel extends Panel {
  /** @param {{items?: {label: string, value: any}[], emptyText?: string}} options */
  constructor({ items = [], emptyText = '' } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-list-panel');
    this.list = document.createElement('ul');
    this.list.className = 'cr-list';
    this.list.tabIndex = 0;
    this.list.setAttribute('role', 'listbox');
    this.list.addEventListener('mousedown', (e) => {
      const row = e.target.closest('li[data-index]');
      if (row) this.select(Number(row.dataset.index));
    });
    this.list.addEventListener('keydown', (e) => this._key(e));
    this.element.appendChild(this.list);
    this.emptyText = emptyText;
    this._items = [];
    this._selectedValue = undefined;
    this.items = items;
  }

  get items() { return [...this._items]; }
  set items(items) {
    this._items = [...items];
    if (!this._items.some((item) => item.value === this._selectedValue)) {
      this._selectedValue = undefined;
    }
    this._render();
  }

  addItem(item) { this.items = [...this._items, item]; }

  removeItem(index) {
    const items = this.items;
    items.splice(index, 1);
    this.items = items;
  }

  replaceItem(index, item) {
    const items = this.items;
    items[index] = item;
    this.items = items;
  }

  get selectedIndex() {
    return this._items.findIndex((item) => item.value === this._selectedValue);
  }

  get selectedItem() { return this._items[this.selectedIndex] ?? null; }

  /** Selects the item at `index` (-1 for none) and fires a select event. */
  select(index) {
    const item = this._items[index];
    const value = item ? item.value : undefined;
    if (value === this._selectedValue) return;
    this._selectedValue = value;
    this._render();
    this.element.dispatchEvent(new CustomEvent('select', { detail: { index, item: item ?? null } }));
  }

  /** A ListPanel holds only its list. */
  add() {
    throw new Error('ListPanel cannot contain other widgets');
  }

  _key(e) {
    const n = this._items.length;
    if (n === 0) return;
    const i = this.selectedIndex;
    const next = { ArrowDown: Math.min(n - 1, i + 1), ArrowUp: Math.max(0, i - 1),
      Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    this.select(next);
  }

  _render() {
    const selected = this.selectedIndex;
    this.list.replaceChildren(...this._items.map((item, index) => {
      const li = document.createElement('li');
      li.dataset.index = String(index);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(index === selected));
      li.textContent = item.label;
      return li;
    }));
    if (this._items.length === 0 && this.emptyText) {
      const li = document.createElement('li');
      li.className = 'cr-list-empty';
      li.textContent = this.emptyText;
      this.list.appendChild(li);
    }
    this.list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }
}
