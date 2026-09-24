// BoardPanel: the output page for a board (grid) display. A placeholder for
// now (see docs/widgets.txt).

import { Panel } from './panel.js';

export class BoardPanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-board-panel');
    this.element.style.cssText += ';background:var(--cr-output-bg);color:var(--cr-text-faint);'
      + 'display:flex;align-items:center;justify-content:center;font:var(--cr-font-size) var(--cr-font-ui)';
    this.element.textContent = 'Board';
  }

  /** Empties the board. Nothing to do yet. */
  clear() {}
}
