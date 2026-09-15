// Spacer: an empty widget that takes up free space in an HPanel.

import { Widget } from './widget.js';

export class Spacer extends Widget {
  constructor(flex = 1) {
    super();
    this.element.classList.add('cr-spacer');
    this.flex = flex;
  }
}
