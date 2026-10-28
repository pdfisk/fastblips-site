// HBoxLayout and VBoxLayout: children in a row or a column.
//
// Along the row (column) each child is as wide (high) as, in order of
// preference: the size the program fixed, a share of the space left over if it
// has flex, the size it asks for. Across it the child fills the row's height
// (the column's width) unless it has an alignment (alignY in a row, alignX in
// a column), when it takes the size it asks for and sits at that side.
//
// Options: spacing (pixels between children); alignX (HBox) or alignY (VBox),
// where the children as a group sit when there is space left and none has
// flex; reversed, to place them from the far end.

import { Layout, inner, placeInSlot, visibleKids, wantHeight, wantWidth } from './layout.js';

class BoxLayout extends Layout {
  constructor(kind, vertical) {
    super(kind, vertical
      ? { spacing: 0, alignY: 'top', reversed: false }
      : { spacing: 0, alignX: 'left', reversed: false });
    this.vertical = vertical;
  }

  apply(container) {
    const { left, top, width, height } = inner(container);
    const v = this.vertical;
    let kids = visibleKids(container);
    if (this.options.reversed) kids = kids.reverse();
    if (kids.length === 0) return;
    const gap = this.options.spacing;
    const extent = v ? height : width;
    const across = v ? width : height;
    const fixed = (k) => (v ? k.fixedHeight : k.fixedWidth);
    const margins = (k) => (v ? k.margin[0] + k.margin[2] : k.margin[1] + k.margin[3]);
    const flexOf = (k) => (fixed(k) == null && k.flex ? k.flex : 0);
    // A flex child starts at its margins; the others at the size they want.
    const sizes = kids.map((k) => (flexOf(k) ? margins(k) : (v ? wantHeight(k) : wantWidth(k))));
    const used = sizes.reduce((a, b) => a + b, 0) + gap * (kids.length - 1);
    const totalFlex = kids.reduce((a, k) => a + flexOf(k), 0);
    const free = Math.max(0, extent - used);
    let start = 0;
    if (totalFlex > 0) {
      kids.forEach((k, i) => { if (flexOf(k)) sizes[i] += free * (flexOf(k) / totalFlex); });
    } else {
      const align = v ? this.options.alignY : this.options.alignX;
      start = align === 'right' || align === 'bottom' ? free : align === 'center' || align === 'middle' ? free / 2 : 0;
    }
    let at = start;
    kids.forEach((k, i) => {
      const p = k.layoutProps ?? {};
      if (v) placeInSlot(k, left, top + at, across, sizes[i], p.alignX, null);
      else placeInSlot(k, left + at, top, sizes[i], across, null, p.alignY);
      at += sizes[i] + gap;
    });
  }
}

export class HBoxLayout extends BoxLayout {
  constructor() { super('hbox', false); }
}

export class VBoxLayout extends BoxLayout {
  constructor() { super('vbox', true); }
}
