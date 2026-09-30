// VPanel: a Panel that arranges its children top to bottom
// (see docs/widgets.txt).
//
// Each child is sized down the column by, in order of preference:
//   child.fixedHeight      - a height in pixels
//   child.flex             - a weight; flex children share the space left over
//   child.preferredHeight() - the height the child asks for
// Children stretch to the panel's full width.

import { Panel } from './panel.js';

export class VPanel extends Panel {
  constructor({ padding = 0, spacing = 0 } = {}) {
    super();
    this.element.classList.add('cr-vpanel');
    this.padding = padding;
    this.spacing = spacing;
  }

  layout() {
    const { width, height } = this.bounds;
    const kids = this._children.filter((c) => c.visible);
    const inner = width - 2 * this.padding;
    const heights = kids.map((c) => (c.fixedHeight ?? (c.flex ? 0 : c.preferredHeight())));
    const used = heights.reduce((a, b) => a + b, 0)
      + this.spacing * Math.max(0, kids.length - 1) + 2 * this.padding;
    const totalFlex = kids.reduce((a, c) => a + (c.fixedHeight == null && c.flex ? c.flex : 0), 0);
    const free = Math.max(0, height - used);
    let y = this.padding;
    kids.forEach((child, i) => {
      let h = heights[i];
      if (child.fixedHeight == null && child.flex) h = free * (child.flex / totalFlex);
      child.setBounds(this.padding, Math.round(y), inner, Math.round(h));
      y += h + this.spacing;
    });
    super.layout();
  }
}
