// BasicLayout: each child sits where the program put it (left, top, width,
// height from its box), or fills the area after fill(). Padding offsets the
// origin. This is how a Panel and the screen place their children.

import { Layout, inner, place, visibleKids } from './layout.js';

export class BasicLayout extends Layout {
  constructor() { super('basic'); }

  apply(container) {
    const { left, top, width, height } = inner(container);
    for (const child of visibleKids(container)) {
      if (child.fillParent) place(child, left, top, width, height);
      else if (child.box) place(child, left + child.box[0], top + child.box[1], child.box[2], child.box[3]);
    }
  }
}
