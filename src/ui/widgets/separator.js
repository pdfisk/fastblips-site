// Separator: a thin vertical line between the widgets of an HPanel, e.g. to
// divide the buttons of a ButtonBar into groups (see docs/widgets.txt).

import { Widget } from './widget.js';

const STYLE = `
.cr-separator{box-sizing:border-box;border-left:1px solid var(--cr-divider);margin:3px 0}
`;

function installStyle() {
  if (document.getElementById('cr-separator-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-separator-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class Separator extends Widget {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-separator');
    this.element.setAttribute('role', 'separator');
    this.element.setAttribute('aria-orientation', 'vertical');
    this.fixedWidth = 7;   // the line, with a little room either side
  }

  setBounds(x, y, width, height) {
    // The line sits in the middle of the room it is given.
    super.setBounds(x + Math.floor(width / 2), y, 1, height);
  }
}
