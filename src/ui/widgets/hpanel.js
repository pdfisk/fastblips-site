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
    if (padding) this.padding = padding;
    this.spacing = spacing;
  }

  layout() {
    const width = this.innerWidth;
    const [pt, pr, pb, pl] = this.padding;
    const kids = this._children.filter((c) => c.visible);
    const inner = Math.max(0, this.innerHeight - pt - pb);
    // Each child is given its width and its margin on both sides.
    const widths = kids.map((c) => (c.fixedWidth ?? (c.flex ? 0 : c.preferredWidth())) + c.margin[1] + c.margin[3]);
    const used = widths.reduce((a, b) => a + b, 0)
      + this.spacing * Math.max(0, kids.length - 1) + pl + pr;
    const totalFlex = kids.reduce((a, c) => a + (c.fixedWidth == null && c.flex ? c.flex : 0), 0);
    const free = Math.max(0, width - used);
    let x = pl;
    kids.forEach((child, i) => {
      let w = widths[i];
      if (child.fixedWidth == null && child.flex) w = free * (child.flex / totalFlex);
      child.setBounds(Math.round(x), pt, Math.round(w), inner);
      x += w + this.spacing;
    });
    super.layout();
  }
}
