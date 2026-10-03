// BoardPanel: the output page for a board - a grid of equally sized
// rectangular cells, for board games such as checkers, chess and
// tic-tac-toe (see docs/widgets.txt).
//
// Each cell holds a short text (a piece: 'X', 'O', a chess glyph) and can be
// given its own background and text colour. Rows and columns are numbered
// from 0, row 0 at the top and column 0 at the left.

import { Panel } from './panel.js';

const STYLE = `
.cr-board-panel{background:var(--cr-output-bg);overflow:hidden}
.cr-board{position:absolute;inset:0;display:grid;gap:1px;padding:1px;box-sizing:border-box;
  background:var(--cr-board-line);color:var(--cr-board-text);
  font-family:var(--cr-font-ui);line-height:1;user-select:none;cursor:default}
.cr-board-cell{display:flex;align-items:center;justify-content:center;overflow:hidden;
  min-width:0;min-height:0;white-space:pre;background:var(--cr-board-light)}
.cr-board-cell.cr-board-dark{background:var(--cr-board-dark)}
.cr-board-cell[aria-selected="true"]{box-shadow:inset 0 0 0 3px var(--cr-board-selected)}
`;

function installStyle() {
  if (document.getElementById('cr-board-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-board-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const MAX_SIDE = 100;   // the most rows or columns a board can have

function checkSide(value, what) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SIDE) {
    throw new RangeError(`a board's ${what} must be a whole number from 1 to ${MAX_SIDE}, not ${value}`);
  }
  return value;
}

export class BoardPanel extends Panel {
  /**
   * @param {{rows?: number, columns?: number, checkered?: boolean, squareCells?: boolean}} options
   *   checkered: colour the cells alternately light and dark, as on a chess
   *   board; squareCells: keep the cells square (the board is then centred)
   *   rather than stretching them to fill the panel.
   */
  constructor({ rows = 8, columns = 8, checkered = true, squareCells = false } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-board-panel');
    this.grid = document.createElement('div');
    this.grid.className = 'cr-board';
    this.grid.setAttribute('role', 'grid');
    this.grid.addEventListener('click', (e) => {
      const cell = e.target.closest?.('.cr-board-cell');
      if (!cell) return;
      const row = Number(cell.dataset.row);
      const column = Number(cell.dataset.column);
      this.element.dispatchEvent(new CustomEvent('cellclick',
        { detail: { row, column, text: this.getText(row, column) } }));
    });
    this.element.appendChild(this.grid);
    this._checkered = Boolean(checkered);
    this._squareCells = Boolean(squareCells);
    this._selected = null;
    this._cells = [];
    this.setSize(rows, columns);
  }

  /** The number of rows and of columns. Change them with setSize(). */
  get rows() { return this._rows; }
  get columns() { return this._columns; }

  /** Divides the board into rows x columns cells. The board is emptied. */
  setSize(rows, columns) {
    this._rows = checkSide(rows, 'rows');
    this._columns = checkSide(columns, 'columns');
    this._selected = null;
    this._cells = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const cell = document.createElement('div');
        cell.className = 'cr-board-cell';
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.setAttribute('role', 'gridcell');
        this._cells.push(cell);
      }
    }
    this.grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    this.grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    this.grid.replaceChildren(...this._cells);
    this._shade();
    this.layout();
  }

  /** True if the cells are coloured alternately light and dark. */
  get checkered() { return this._checkered; }
  set checkered(value) {
    this._checkered = Boolean(value);
    this._shade();
  }

  /** True if the cells are kept square instead of filling the panel. */
  get squareCells() { return this._squareCells; }
  set squareCells(value) {
    this._squareCells = Boolean(value);
    this.layout();
  }

  /** The text in a cell ('' if it is empty). */
  getText(row, column) { return this._cell(row, column).textContent; }

  /** Puts text (a piece) in a cell; '' empties it. */
  setText(row, column, text) { this._cell(row, column).textContent = String(text ?? ''); }

  /** A cell's own background colour, or '' if it has the board's. */
  getBackground(row, column) { return this._cell(row, column).style.background; }

  /** Gives a cell a background (any CSS colour); '' restores the board's. */
  setBackground(row, column, color) { this._cell(row, column).style.background = color ?? ''; }

  /** A cell's own text colour, or '' if it has the board's. */
  getColor(row, column) { return this._cell(row, column).style.color; }

  /** Gives a cell's text a colour (any CSS colour); '' restores the board's. */
  setColor(row, column, color) { this._cell(row, column).style.color = color ?? ''; }

  /** The selected cell as { row, column }, or null. */
  get selected() { return this._selected && { ...this._selected }; }

  /** Marks a cell as selected (one at a time) and fires a select event. */
  select(row, column) {
    const cell = this._cell(row, column);
    if (this._selected?.row === row && this._selected?.column === column) return;
    this._unmark();
    this._selected = { row, column };
    cell.setAttribute('aria-selected', 'true');
    this.element.dispatchEvent(new CustomEvent('select', { detail: { row, column } }));
  }

  /** Leaves no cell selected. */
  clearSelection() {
    if (!this._selected) return;
    this._unmark();
    this._selected = null;
    this.element.dispatchEvent(new CustomEvent('select', { detail: null }));
  }

  /** Empties the board: every cell's text and colours, and the selection.
   *  The size stays. */
  clear() {
    for (const cell of this._cells) {
      cell.textContent = '';
      cell.style.background = '';
      cell.style.color = '';
    }
    this._unmark();
    this._selected = null;
  }

  /** A BoardPanel holds only its cells. */
  add() {
    throw new Error('BoardPanel cannot contain other widgets');
  }

  layout() {
    const { width, height } = this.bounds;
    const s = this.grid.style;
    if (width <= 0 || height <= 0) return;   // not placed yet: CSS fills the panel
    let w = width;
    let h = height;
    if (this._squareCells) {
      const side = Math.floor(Math.min(width / this._columns, height / this._rows));
      w = side * this._columns;
      h = side * this._rows;
    }
    s.inset = 'auto';
    s.left = `${Math.floor((width - w) / 2)}px`;
    s.top = `${Math.floor((height - h) / 2)}px`;
    s.width = `${w}px`;
    s.height = `${h}px`;
    // Pieces scale with the cells.
    s.fontSize = `${Math.max(8, Math.floor(Math.min(w / this._columns, h / this._rows) * 0.6))}px`;
    super.layout();
  }

  _cell(row, column) {
    if (!Number.isInteger(row) || row < 0 || row >= this._rows
      || !Number.isInteger(column) || column < 0 || column >= this._columns) {
      throw new RangeError(`the board has no cell at row ${row}, column ${column} `
        + `(its rows are 0 to ${this._rows - 1} and its columns 0 to ${this._columns - 1})`);
    }
    return this._cells[row * this._columns + column];
  }

  _unmark() {
    if (this._selected) this._cell(this._selected.row, this._selected.column).removeAttribute('aria-selected');
  }

  _shade() {
    for (const cell of this._cells) {
      const dark = this._checkered && (Number(cell.dataset.row) + Number(cell.dataset.column)) % 2 === 1;
      cell.classList.toggle('cr-board-dark', dark);
    }
  }
}
