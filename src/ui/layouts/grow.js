// GrowLayout: every child fills the whole area (less its margin). With one
// child it is that child's frame; a Stack uses it and shows one child at a
// time.

import { Layout, inner, place, visibleKids } from './layout.js';

export class GrowLayout extends Layout {
  constructor() { super('grow'); }

  apply(container) {
    const { left, top, width, height } = inner(container);
    for (const child of visibleKids(container)) place(child, left, top, width, height);
  }
}
