// CanvasLayout: children placed by their distance from the edges, in pixels
// or percentages of the area: left, top, right, bottom, width, height (set
// with a widget's canvas props, in that order). Two of the three on an axis
// fix both position and size; a single edge or a size alone takes the other
// from the child's box. A child with no canvas props sits where its box says,
// as in a BasicLayout.

import { Layout, inner, lengthPx, place, visibleKids } from './layout.js';

/** [start, size] along an axis of `extent`, from whichever of start / end / size are given (px or null). */
function axis(start, end, length, extent, boxStart, boxSize) {
  if (start !== null && end !== null) return [start, Math.max(0, extent - start - end)];
  if (length !== null) {
    if (start !== null) return [start, length];
    if (end !== null) return [extent - end - length, length];
    return [boxStart, length];
  }
  if (start !== null) return [start, boxSize];
  if (end !== null) return [extent - end - boxSize, boxSize];
  return [boxStart, boxSize];
}

export class CanvasLayout extends Layout {
  constructor() { super('canvas'); }

  apply(container) {
    const { left, top, width, height } = inner(container);
    for (const child of visibleKids(container)) {
      if (child.fillParent) { place(child, left, top, width, height); continue; }
      const [bx, by, bw, bh] = child.box ?? [0, 0, 0, 0];
      const spec = child.layoutProps?.canvas;
      if (!spec) { if (child.box) place(child, left + bx, top + by, bw, bh); continue; }
      const [l, t, r, b, w, h] = [
        lengthPx(spec[0], width), lengthPx(spec[1], height), lengthPx(spec[2], width),
        lengthPx(spec[3], height), lengthPx(spec[4], width), lengthPx(spec[5], height),
      ];
      const [x, cw] = axis(l, r, w, width, bx, bw);
      const [y, ch] = axis(t, b, h, height, by, bh);
      place(child, left + x, top + y, cw, ch);
    }
  }
}
