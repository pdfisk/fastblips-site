// ListPanel: a Panel filled by a single list (see docs/widgets.txt).
//
// Items are { label, value } objects. The selection is tracked by value, so
// replacing the items (e.g. on a refresh) keeps the same row selected.
//
// An item may also have:
//   header: true   a heading between groups of rows (e.g. the forum's board
//                  groups): shown in small capitals, never selected, skipped
//                  by the arrow keys
//   icon           a short text (a symbol) before the label
//   detail         a short text at the right end of the row (a count)
//   badge: true    shows the detail as a highlighted pill (e.g. unread)
//   title          a tooltip for the row

import { Panel } from './panel.js';

const STYLE = `
.cr-list{position:absolute;inset:0;overflow:auto;margin:0;padding:2px 0;list-style:none;
  box-sizing:border-box;outline:0;background:var(--cr-input-bg);color:var(--cr-text);
  font:var(--cr-font-size)/1.4 var(--cr-font-code)}
.cr-list li{padding:2px 8px;white-space:pre;cursor:default}
.cr-list li[aria-selected="true"]{background:var(--cr-list-selected)}
.cr-list:focus li[aria-selected="true"]{background:var(--cr-list-selected-focus);color:var(--cr-list-selected-focus-text)}
.cr-list-empty{color:var(--cr-text-faint);padding:6px 8px}
.cr-list li.cr-list-rich{display:flex;align-items:center;gap:6px;white-space:nowrap}
.cr-list-icon{flex:none;width:1.2em;text-align:center;color:var(--cr-text-muted)}
.cr-list-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.cr-list-detail{flex:none;color:var(--cr-text-faint);font-size:var(--cr-font-size-small)}
.cr-list-detail.cr-list-badge{color:var(--cr-accent-text);background:var(--cr-accent);border-radius:8px;
  padding:0 6px;line-height:16px;font-weight:600}
.cr-list li.cr-list-header{padding:8px 8px 2px;font:600 11px var(--cr-font-ui);letter-spacing:.06em;
  text-transform:uppercase;color:var(--cr-text-faint);cursor:default;background:none}
.cr-list li.cr-list-header:first-child{padding-top:4px}
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
    if (this._selectedValue === undefined) return -1;
    return this._items.findIndex((item) => !item.header && item.value === this._selectedValue);
  }

  get selectedItem() { return this._items[this.selectedIndex] ?? null; }

  /** Selects the item at `index` (-1 for none) and fires a select event. */
  select(index) {
    if (this._items[index]?.header) return;   // headings are never selected
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
    // The rows that can be selected (headings cannot), by index.
    const rows = this._items.map((item, i) => (item.header ? -1 : i)).filter((i) => i >= 0);
    const n = rows.length;
    if (n === 0) return;
    const at = rows.indexOf(this.selectedIndex);
    const next = { ArrowDown: Math.min(n - 1, at + 1), ArrowUp: Math.max(0, at - 1),
      Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    this.select(rows[next]);
  }

  _render() {
    const selected = this.selectedIndex;
    this.list.replaceChildren(...this._items.map((item, index) => {
      const li = document.createElement('li');
      li.dataset.index = String(index);
      li.setAttribute('role', 'option');
      if (item.header) {
        li.className = 'cr-list-header';
        li.setAttribute('role', 'presentation');
        li.textContent = item.label;
        return li;
      }
      li.setAttribute('aria-selected', String(index === selected));
      if (item.title) li.title = item.title;
      if (item.icon == null && item.detail == null) {
        li.textContent = item.label;
        return li;
      }
      li.classList.add('cr-list-rich');
      const part = (cls, text) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        return span;
      };
      if (item.icon != null) li.appendChild(part('cr-list-icon', item.icon));
      li.appendChild(part('cr-list-label', item.label));
      if (item.detail != null && item.detail !== '') {
        li.appendChild(part(`cr-list-detail${item.badge ? ' cr-list-badge' : ''}`, item.detail));
      }
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
