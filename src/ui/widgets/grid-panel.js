// GridPanel: a Panel filled by a single table of rows and columns, with a
// header row of column names (see docs/widgets.txt). Like ListPanel, its
// rows are tracked by value, so replacing the rows (e.g. on a refresh) keeps
// the same row selected; clicking a column's header sorts by it, and
// clicking it again reverses the order. Dragging the right edge of a header
// resizes that column.
//
//   const grid = new GridPanel({ columns: [{ label: 'Name' }, { label: 'Owner' }] });
//   grid.rows = [{ value: 1, cells: ['Hello', 'peter'] }];

import { Panel } from './panel.js';

const STYLE = `
.cr-grid{position:absolute;inset:0;overflow:auto;box-sizing:border-box;outline:0;
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size)/1.4 var(--cr-font-code)}
.cr-grid table{border-collapse:collapse;width:100%;table-layout:fixed}
.cr-grid th{position:sticky;top:0;z-index:1;text-align:left;font-weight:normal;
  padding:2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;
  user-select:none;background:var(--cr-header-bg);color:var(--cr-header-text);
  border-bottom:1px solid var(--cr-divider);border-right:1px solid var(--cr-divider)}
.cr-grid th:hover{color:var(--cr-text)}
.cr-grid-handle{position:absolute;top:0;right:-3px;bottom:0;width:7px;cursor:col-resize;
  touch-action:none;z-index:2}
.cr-grid-handle:hover,.cr-grid-handle.cr-dragging{background:var(--cr-divider)}
.cr-grid .cr-grid-filler{padding:0;border-right:0;cursor:default}
.cr-grid td{padding:2px 8px;white-space:pre;overflow:hidden;text-overflow:ellipsis;cursor:default}
.cr-grid tr[aria-selected="true"] td{background:var(--cr-list-selected)}
.cr-grid:focus tr[aria-selected="true"] td{background:var(--cr-list-selected-focus);
  color:var(--cr-list-selected-focus-text)}
.cr-grid-empty{color:var(--cr-text-faint);padding:6px 8px}
`;

function installStyle() {
  if (document.getElementById('cr-grid-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-grid-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class GridPanel extends Panel {
  /**
   * @param {object} options
   * @param {{label: string, width?: string}[]} options.columns - the column
   *   headers; width is any CSS width (the rest share what is left)
   * @param {{value: any, cells: string[], sort?: any[]}[]} [options.rows] -
   *   value identifies the row; sort, if given, replaces cells as what a
   *   column is sorted by (e.g. a timestamp for a column showing a date)
   * @param {string} [options.emptyText] - shown when there are no rows
   */
  constructor({ columns = [], rows = [], emptyText = '' } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-grid-panel');
    this.columns = columns;
    this.emptyText = emptyText;
    this.grid = document.createElement('div');
    this.grid.className = 'cr-grid';
    this.grid.tabIndex = 0;
    this.grid.setAttribute('role', 'grid');
    this.table = document.createElement('table');
    // One <col> per column, and a last one for the space left over once the
    // columns have been given widths of their own (see _freeze).
    this.cols = document.createElement('colgroup');
    this.head = this.table.createTHead().insertRow();
    this.headers = columns.map((column, i) => {
      const col = document.createElement('col');
      if (column.width) col.style.width = column.width;
      this.cols.appendChild(col);
      const th = document.createElement('th');
      th.setAttribute('role', 'columnheader');
      const label = document.createElement('span');
      th.appendChild(label);
      th.addEventListener('click', () => this.sortBy(i));
      const handle = document.createElement('div');
      handle.className = 'cr-grid-handle';
      handle.setAttribute('role', 'separator');
      handle.addEventListener('click', (e) => e.stopPropagation());   // not a sort
      handle.addEventListener('pointerdown', (e) => this._resize(e, i, handle));
      th.appendChild(handle);
      this.head.appendChild(th);
      return label;
    });
    this.filler = document.createElement('col');
    this.filler.style.width = '0';
    this.cols.appendChild(this.filler);
    const fillerHeader = document.createElement('th');
    fillerHeader.className = 'cr-grid-filler';
    this.head.appendChild(fillerHeader);
    this.table.prepend(this.cols);
    this._frozen = false;
    this.body = this.table.createTBody();
    this.note = document.createElement('div');
    this.note.className = 'cr-grid-empty';
    this.grid.append(this.table, this.note);
    this.grid.addEventListener('mousedown', (e) => {
      const row = e.target.closest('tr[data-index]');
      if (row) this.select(Number(row.dataset.index));
    });
    this.grid.addEventListener('keydown', (e) => this._key(e));
    this.element.appendChild(this.grid);
    this._rows = [];
    this._selectedValue = undefined;
    this._sort = null;   // { column, descending } or null (the order given)
    this.rows = rows;
  }

  /** The rows, in the order shown. */
  get rows() { return [...this._rows]; }
  set rows(rows) {
    this._given = [...rows];
    this._arrange();
  }

  get selectedIndex() {
    return this._rows.findIndex((row) => row.value === this._selectedValue);
  }

  get selectedRow() { return this._rows[this.selectedIndex] ?? null; }

  /** Selects the row at `index` (-1 for none) and fires a select event. */
  select(index) {
    const row = this._rows[index];
    const value = row ? row.value : undefined;
    if (value === this._selectedValue) return;
    this._selectedValue = value;
    this._render();
    this.element.dispatchEvent(new CustomEvent('select', { detail: { index, row: row ?? null } }));
  }

  /** Sorts by column `index`; the same column again reverses the order. */
  sortBy(index) {
    const descending = this._sort?.column === index && !this._sort.descending;
    this._sort = { column: index, descending };
    this._arrange();
  }

  /** The widths of the columns, in pixels, as they are now. */
  get columnWidths() { return [...this.head.children].slice(0, this.columns.length).map((th) => th.offsetWidth); }

  /** Sets the width of column `index`, in pixels (at least 40). */
  setColumnWidth(index, width) {
    this._freeze();
    this.cols.children[index].style.width = `${Math.max(40, Math.round(width))}px`;
  }

  // Until a column is resized the columns share the panel's width as the
  // browser lays it out; the first resize fixes every column at the width it
  // has now, with the filler column taking what is left (none, if the
  // columns are wider than the panel, and then the panel scrolls sideways).
  _freeze() {
    if (this._frozen) return;
    const widths = this.columnWidths;
    widths.forEach((w, i) => { this.cols.children[i].style.width = `${w}px`; });
    this.filler.style.width = '';
    this._frozen = true;
  }

  _resize(e, index, handle) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this._freeze();
    const startX = e.clientX;
    const startWidth = this.columnWidths[index];
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('cr-dragging');
    const move = (ev) => this.setColumnWidth(index, startWidth + ev.clientX - startX);
    const done = () => {
      handle.classList.remove('cr-dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  /** A GridPanel holds only its table. */
  add() {
    throw new Error('GridPanel cannot contain other widgets');
  }

  _arrange() {
    this._rows = [...this._given];
    if (this._sort) {
      const { column, descending } = this._sort;
      const key = (row) => (row.sort ?? row.cells)[column] ?? '';
      const sign = descending ? -1 : 1;
      this._rows.sort((a, b) => sign * String(key(a)).localeCompare(String(key(b)), undefined,
        { sensitivity: 'base', numeric: true }));
    }
    if (!this._rows.some((row) => row.value === this._selectedValue)) this._selectedValue = undefined;
    this._render();
  }

  _key(e) {
    const n = this._rows.length;
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
    this.headers.forEach((label, i) => {
      const sorted = this._sort?.column === i;
      label.parentElement.setAttribute('aria-sort', sorted ? (this._sort.descending ? 'descending' : 'ascending') : 'none');
      label.textContent = this.columns[i].label + (sorted ? (this._sort.descending ? ' ▾' : ' ▴') : '');
    });
    this.body.replaceChildren(...this._rows.map((row, index) => {
      const tr = document.createElement('tr');
      tr.dataset.index = String(index);
      tr.setAttribute('role', 'row');
      tr.setAttribute('aria-selected', String(index === selected));
      for (const text of row.cells) {
        const td = document.createElement('td');
        td.setAttribute('role', 'gridcell');
        td.textContent = text;
        tr.appendChild(td);
      }
      tr.appendChild(document.createElement('td')).className = 'cr-grid-filler';
      return tr;
    }));
    this.note.textContent = this._rows.length === 0 ? this.emptyText : '';
    this.note.hidden = this._rows.length > 0 || !this.emptyText;
    this.body.children[selected]?.scrollIntoView({ block: 'nearest' });
  }
}
