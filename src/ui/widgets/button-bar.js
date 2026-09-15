// ButtonBar: a row of buttons (an HPanel). Every Window has one along its
// bottom edge (see docs/widgets.txt).

import { HPanel } from './hpanel.js';
import { Button } from './button.js';

export const BUTTON_BAR_HEIGHT = 30;

export class ButtonBar extends HPanel {
  constructor() {
    super({ padding: 3, spacing: 4 });
    this.height = BUTTON_BAR_HEIGHT;
    this.element.classList.add('cr-button-bar');
    this.element.style.cssText += ';background:#e6e6e6;border-top:1px solid #c8c8c8;'
      + 'box-sizing:border-box';
  }

  /** Adds a Button with the given label and action, and returns it. */
  addButton(label, action) {
    return this.add(new Button(label, action));
  }

  add(child) {
    super.add(child);
    this.layout();
    return child;
  }
}
