// HPanel: a Panel that arranges its children left to right
// (see docs/widgets.txt).
//
// Each child is sized along the row by, in order of preference:
//   child.fixedWidth   - a width in pixels
//   child.flex         - a weight; flex children share the space left over
//   child.preferredWidth() - the width the child asks for
// Children stretch to the panel's full height.

import { Panel } from './panel.js';

export class HPanel extends Panel {
  constructor({ padding = 0, spacing = 0 } = {}) {
    super();
    this.element.classList.add('cr-hpanel');
    this.padding = padding;
    this.spacing = spacing;
  }

  layout() {
    const { width, height } = this.bounds;
    const kids = this._children.filter((c) => c.visible);
    const inner = height - 2 * this.padding;
    const widths = kids.map((c) => (c.fixedWidth ?? (c.flex ? 0 : c.preferredWidth())));
    const used = widths.reduce((a, b) => a + b, 0)
      + this.spacing * Math.max(0, kids.length - 1) + 2 * this.padding;
    const totalFlex = kids.reduce((a, c) => a + (c.fixedWidth == null && c.flex ? c.flex : 0), 0);
    const free = Math.max(0, width - used);
    let x = this.padding;
    kids.forEach((child, i) => {
      let w = widths[i];
      if (child.fixedWidth == null && child.flex) w = free * (child.flex / totalFlex);
      child.setBounds(Math.round(x), this.padding, Math.round(w), inner);
      x += w + this.spacing;
    });
    super.layout();
  }
}
