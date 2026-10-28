// FlowLayout: children side by side, wrapping onto a new line when the next
// one would not fit, as words in a paragraph. Each child takes the size it
// asks for (or the one fixed); a line is as high as its highest child, and a
// child with alignY sits at the top, middle or bottom of its line.
// Options: spacingX between children, spacingY between lines; alignX, where
// each line sits across the width; reversed, to place the children from the
// last to the first.

import { Layout, inner, place, propsOf, visibleKids, wantHeight, wantWidth } from './layout.js';

export class FlowLayout extends Layout {
  constructor() { super('flow', { spacingX: 0, spacingY: 0, alignX: 'left', reversed: false }); }

  apply(container) {
    const { left, top, width } = inner(container);
    const { spacingX: sx, spacingY: sy, alignX } = this.options;
    let kids = visibleKids(container);
    if (this.options.reversed) kids = kids.reverse();
    const lines = [];
    let line = null;
    for (const child of kids) {
      const w = wantWidth(child);
      const h = wantHeight(child);
      if (!line || (line.items.length > 0 && line.width + sx + w > width)) {
        line = { items: [], width: 0, height: 0 };
        lines.push(line);
      }
      line.width += (line.items.length > 0 ? sx : 0) + w;
      line.height = Math.max(line.height, h);
      line.items.push({ child, w, h });
    }
    let y = top;
    for (const ln of lines) {
      const spare = Math.max(0, width - ln.width);
      let x = left + (alignX === 'right' ? spare : alignX === 'center' ? spare / 2 : 0);
      for (const { child, w, h } of ln.items) {
        const align = propsOf(child).alignY;
        const dy = align === 'bottom' ? ln.height - h : align === 'middle' ? (ln.height - h) / 2 : 0;
        place(child, x, y + dy, w, h);
        x += w + sx;
      }
      y += ln.height + sy;
    }
  }
}
