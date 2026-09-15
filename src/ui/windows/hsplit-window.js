// HSplitWindow: a Window whose content is an HSplitPanel.

import { Window } from './window.js';
import { HSplitPanel } from '../widgets/hsplit-panel.js';

export class HSplitWindow extends Window {
  /**
   * @param {object} options - Window options, plus `left`, `right` (widgets)
   *   and `position` (fraction of the width given to the left side).
   */
  constructor({ left = null, right = null, position = 0.5, ...windowOptions } = {}) {
    super(windowOptions);
    this.element.classList.add('cr-hsplit-window');
    this.splitPanel = new HSplitPanel({ first: left, second: right, position });
    this.content = this.splitPanel;
  }

  get left() { return this.splitPanel.first; }
  set left(widget) { this.splitPanel.first = widget; }
  get right() { return this.splitPanel.second; }
  set right(widget) { this.splitPanel.second = widget; }
}
