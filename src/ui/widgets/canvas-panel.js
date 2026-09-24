// CanvasPanel: the output page for drawing. A placeholder for now
// (see docs/widgets.txt).

import { Panel } from './panel.js';

export class CanvasPanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-canvas-panel');
    this.element.style.cssText += ';background:var(--cr-output-bg);color:var(--cr-text-faint);'
      + 'display:flex;align-items:center;justify-content:center;font:var(--cr-font-size) var(--cr-font-ui)';
    this.element.textContent = 'Canvas';
  }

  /** Erases the drawing. Nothing to do yet. */
  clear() {}
}
