// HSplitPanel: two children side by side with a vertical divider between
// them (see docs/widgets.txt).

import { SplitPanel } from './split-panel.js';

export class HSplitPanel extends SplitPanel {
  get orientation() { return 'horizontal'; }
}
