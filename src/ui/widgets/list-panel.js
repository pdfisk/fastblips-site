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
//
// new ListPanel({ multiple: true }) lets several rows be selected:
// Ctrl/Cmd+click adds or removes a row, Shift+click selects the rows from the
// last one clicked, and Ctrl/Cmd+A selects them all. A plain click, or an
// arrow key, selects one row as usual.

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
  /** @param {{items?: {label: string, value: any}[], emptyText?: string, multiple?: boolean}} options */
  constructor({ items = [], emptyText = '', multiple = false } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-list-panel');
    this.list = document.createElement('ul');
    this.list.className = 'cr-list';
    this.list.tabIndex = 0;
    this.list.setAttribute('role', 'listbox');
    this.multiple = Boolean(multiple);
    if (this.multiple) this.list.setAttribute('aria-multiselectable', 'true');
    this.list.addEventListener('mousedown', (e) => {
      const row = e.target.closest('li[data-index]');
      if (!row) return;
      const index = Number(row.dataset.index);
      if (this.multiple && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.toggle(index); }
      else if (this.multiple && e.shiftKey) { e.preventDefault(); this.selectRange(index); }
      else this.select(index);
    });
    this.list.addEventListener('keydown', (e) => this._key(e));
    this.element.appendChild(this.list);
    this.emptyText = emptyText;
    this._items = [];
    // The values of the selected rows, in the order they were selected. A
    // list that is not multiple has at most one.
    this._selected = [];
    this._anchor = undefined;   // the value Shift+click selects from
    this.items = items;
  }

  get items() { return [...this._items]; }
  set items(items) {
    this._items = [...items];
    // Rows that are no longer there are no longer selected.
    this._selected = this._selected.filter((v) => this._rowOf(v) >= 0);
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

  /** The index of the row with this value (not a heading), or -1. */
  _rowOf(value) {
    return this._items.findIndex((item) => !item.header && item.value === value);
  }

  /** The selected row (the last one selected, in a multiple list), or -1. */
  get selectedIndex() {
    if (this._selected.length === 0) return -1;
    return this._rowOf(this._selected[this._selected.length - 1]);
  }

  get selectedItem() { return this._items[this.selectedIndex] ?? null; }

  /** Every selected row's index, in list order. */
  get selectedIndices() {
    return this._selected.map((v) => this._rowOf(v)).filter((i) => i >= 0).sort((a, b) => a - b);
  }

  /** Every selected item, in list order. */
  get selectedItems() { return this.selectedIndices.map((i) => this._items[i]); }

  /** The values of the selected items, in list order. Setting them selects
   *  those rows (values with no row are skipped) without a select event. */
  get selectedValues() { return this.selectedItems.map((item) => item.value); }
  set selectedValues(values) {
    let wanted = [...values].filter((v) => this._rowOf(v) >= 0);
    if (!this.multiple) wanted = wanted.slice(-1);
    this._selected = wanted;
    this._anchor = wanted[wanted.length - 1];
    this._render();
  }

  /** Selects the item at `index` (-1 for none), and only it, and fires a
   *  select event. */
  select(index) {
    if (this._items[index]?.header) return;   // headings are never selected
    const item = this._items[index];
    const values = item ? [item.value] : [];
    this._anchor = item ? item.value : undefined;
    this._change(values, index);
  }

  /** In a multiple list: adds the row at `index` to the selection, or
   *  takes it out. Fires a select event. */
  toggle(index) {
    const item = this._items[index];
    if (!item || item.header) return;
    if (!this.multiple) { this.select(index); return; }
    const values = this._selected.includes(item.value)
      ? this._selected.filter((v) => v !== item.value)
      : [...this._selected, item.value];
    this._anchor = item.value;
    this._change(values, index);
  }

  /** In a multiple list: selects every row from the last one clicked to the
   *  one at `index`. Fires a select event. */
  selectRange(index) {
    const item = this._items[index];
    if (!item || item.header) return;
    const from = this._rowOf(this._anchor);
    if (!this.multiple || from < 0) { this.select(index); return; }
    const values = [];
    for (let i = Math.min(from, index); i <= Math.max(from, index); i += 1) {
      if (!this._items[i].header) values.push(this._items[i].value);
    }
    this._change(values, index);
  }

  /** In a multiple list: selects every row. Fires a select event. */
  selectAll() {
    if (!this.multiple) return;
    const values = this._items.filter((item) => !item.header).map((item) => item.value);
    this._change(values, this.selectedIndex);
  }

  /** Sets the selection; if it changed, redraws and fires a select event
   *  with detail { index, item, items }: item is the row acted on (null
   *  when nothing is selected), items every selected item. */
  _change(values, index) {
    const same = values.length === this._selected.length && values.every((v, i) => v === this._selected[i]);
    if (same) return;
    this._selected = values;
    this._render();
    const item = values.length > 0 ? (this._items[index] ?? this.selectedItem) : null;
    this.element.dispatchEvent(new CustomEvent('select', {
      detail: { index: item ? this._items.indexOf(item) : -1, item, items: this.selectedItems },
    }));
  }

  /** A ListPanel holds only its list. */
  add() {
    throw new Error('ListPanel cannot contain other widgets');
  }

  _key(e) {
    if (this.multiple && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.selectAll();
      return;
    }
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
    const chosen = new Set(this.selectedIndices);
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
      li.setAttribute('aria-selected', String(chosen.has(index)));
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
