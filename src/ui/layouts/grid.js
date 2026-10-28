// GridLayout: children in the cells of a table of rows and columns. A child
// names its cell (row, column: from 0; both 0 when not set) and may span
// several rows or columns. Options: spacingX between columns, spacingY
// between rows.
//
// Each column (row) has a width (height): its fixed size if one was set, else
// that of the widest (highest) child in it, as it asks for its size. It may
// also have a flex, a min and a max. When the grid is wider (higher) than its
// tracks, the space left is shared among the tracks with flex, in proportion
// to their flex; when it is narrower, they shrink the same way. Both stop at
// the track's min and max. A child that spans tracks adds what it still needs
// to the last track it spans that has no fixed size.
//
// A child fills its cell, less its margin, unless it has an alignment (alignX,
// alignY), when it takes the size it asks for and sits at that side of the cell.

import { Layout, LayoutError, inner, placeInSlot, propsOf, visibleKids, wantHeight, wantWidth } from './layout.js';

const TRACK_KEYS = ['flex', 'size', 'min', 'max'];

/** Shares `free` (may be negative) among the tracks with flex, within each one's min and max. */
function distribute(sizes, flex, min, max, free) {
  let active = flex.map((f, i) => (f > 0 ? i : -1)).filter((i) => i >= 0);
  let remaining = free;
  while (active.length > 0 && Math.abs(remaining) > 0.01) {
    const total = active.reduce((a, i) => a + flex[i], 0);
    const next = [];
    let spent = 0;
    for (const i of active) {
      const want = sizes[i] + (remaining * flex[i]) / total;
      const got = Math.min(max[i], Math.max(min[i], want));
      spent += got - sizes[i];
      sizes[i] = got;
      if (got === want) next.push(i);
    }
    remaining -= spent;
    if (next.length === active.length) break;
    active = next;
  }
}

/** The sizes of n tracks along one axis. */
function solve(n, spec, cells, startOf, spanOf, want, extent, gap) {
  const sizes = Array.from({ length: n }, (_, i) => spec[i]?.size ?? 0);
  const fixed = (i) => spec[i]?.size !== undefined;
  for (const cell of cells) {
    if (spanOf(cell) === 1 && !fixed(startOf(cell))) sizes[startOf(cell)] = Math.max(sizes[startOf(cell)], want(cell));
  }
  for (const cell of cells) {
    const span = spanOf(cell);
    if (span === 1) continue;
    const first = startOf(cell);
    const have = sizes.slice(first, first + span).reduce((a, b) => a + b, 0) + gap * (span - 1);
    if (want(cell) > have) {
      let target = first + span - 1;
      for (let i = first + span - 1; i >= first; i -= 1) if (!fixed(i)) { target = i; break; }
      sizes[target] += want(cell) - have;
    }
  }
  const min = Array.from({ length: n }, (_, i) => spec[i]?.min ?? 0);
  const max = Array.from({ length: n }, (_, i) => spec[i]?.max ?? Infinity);
  const flex = Array.from({ length: n }, (_, i) => spec[i]?.flex ?? 0);
  for (let i = 0; i < n; i += 1) sizes[i] = Math.min(max[i], Math.max(min[i], sizes[i]));
  const free = extent - sizes.reduce((a, b) => a + b, 0) - gap * Math.max(0, n - 1);
  distribute(sizes, flex, min, max, free);
  return sizes;
}

export class GridLayout extends Layout {
  constructor() {
    super('grid', { spacingX: 0, spacingY: 0 });
    this.columns = {};   // index -> { flex?, size?, min?, max? }
    this.rows = {};
  }

  /** Sets one setting of a column or row: axis 'column' | 'row', key flex | size | min | max. */
  setTrack(axis, index, key, value) {
    if (!TRACK_KEYS.includes(key)) throw new LayoutError(`a ${axis} has no ${key} setting`);
    if (!Number.isInteger(index) || index < 0) throw new LayoutError(`${axis} ${index}: a ${axis} number is a whole number of 0 or more`);
    if (!Number.isFinite(value) || value < 0) throw new LayoutError(`the ${axis}'s ${key} must be a number of 0 or more, not ${value}`);
    const tracks = axis === 'column' ? this.columns : this.rows;
    (tracks[index] ??= {})[key] = key === 'flex' ? value : Math.round(value);
  }

  toJSON() {
    const out = super.toJSON();
    if (Object.keys(this.columns).length) out.columns = JSON.parse(JSON.stringify(this.columns));
    if (Object.keys(this.rows).length) out.rows = JSON.parse(JSON.stringify(this.rows));
    return out;
  }

  load(saved = {}) {
    if (!saved || typeof saved !== 'object') throw new LayoutError('layoutOptions must be an object');
    const { columns, rows, ...options } = saved;
    super.load(options);
    for (const [axis, tracks] of [['column', columns], ['row', rows]]) {
      for (const [index, settings] of Object.entries(tracks ?? {})) {
        for (const [key, value] of Object.entries(settings ?? {})) this.setTrack(axis, Number(index), key, value);
      }
    }
  }

  apply(container) {
    const area = inner(container);
    const kids = visibleKids(container);
    if (kids.length === 0) return;
    const cells = kids.map((child) => {
      const p = propsOf(child);
      return { child, row: p.row ?? 0, column: p.column ?? 0, rowSpan: p.rowSpan ?? 1, columnSpan: p.columnSpan ?? 1, p };
    });
    const nColumns = Math.max(...cells.map((c) => c.column + c.columnSpan));
    const nRows = Math.max(...cells.map((c) => c.row + c.rowSpan));
    const { spacingX: sx, spacingY: sy } = this.options;
    const widths = solve(nColumns, this.columns, cells, (c) => c.column, (c) => c.columnSpan,
      (c) => wantWidth(c.child), area.width, sx);
    const heights = solve(nRows, this.rows, cells, (c) => c.row, (c) => c.rowSpan,
      (c) => wantHeight(c.child), area.height, sy);
    const xs = [];
    let x = area.left;
    for (const w of widths) { xs.push(x); x += w + sx; }
    const ys = [];
    let y = area.top;
    for (const h of heights) { ys.push(y); y += h + sy; }
    for (const c of cells) {
      const w = widths.slice(c.column, c.column + c.columnSpan).reduce((a, b) => a + b, 0) + sx * (c.columnSpan - 1);
      const h = heights.slice(c.row, c.row + c.rowSpan).reduce((a, b) => a + b, 0) + sy * (c.rowSpan - 1);
      placeInSlot(c.child, xs[c.column], ys[c.row], w, h, c.p.alignX, c.p.alignY);
    }
  }
}
