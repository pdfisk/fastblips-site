// DockLayout: children attached to the edges of the area, in the order they
// were added. A north or south child takes the full width of what is left and
// the height it asks for (or the one fixed); a west or east child takes the
// full height left and the width it asks for. Whatever is left in the middle
// goes to the children whose edge is center (the default), all of them
// filling it. Options: spacingX and spacingY, the space between docked
// children.

import { Layout, inner, place, propsOf, visibleKids, wantHeight, wantWidth } from './layout.js';

export class DockLayout extends Layout {
  constructor() { super('dock', { spacingX: 0, spacingY: 0 }); }

  apply(container) {
    const area = inner(container);
    const { spacingX: sx, spacingY: sy } = this.options;
    let l = area.left;
    let t = area.top;
    let r = area.left + area.width;
    let b = area.top + area.height;
    const middle = [];
    for (const child of visibleKids(container)) {
      const edge = propsOf(child).edge ?? 'center';
      const w = Math.min(wantWidth(child), Math.max(0, r - l));
      const h = Math.min(wantHeight(child), Math.max(0, b - t));
      switch (edge) {
        case 'north': place(child, l, t, r - l, h); t += h + sy; break;
        case 'south': place(child, l, b - h, r - l, h); b -= h + sy; break;
        case 'west': place(child, l, t, w, b - t); l += w + sx; break;
        case 'east': place(child, r - w, t, w, b - t); r -= w + sx; break;
        default: middle.push(child); break;
      }
    }
    for (const child of middle) place(child, l, t, Math.max(0, r - l), Math.max(0, b - t));
  }
}
