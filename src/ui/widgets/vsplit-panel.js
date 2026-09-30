// VSplitPanel: two children stacked, with a horizontal divider between them
// (see docs/widgets.txt).

import { SplitPanel } from './split-panel.js';

export class VSplitPanel extends SplitPanel {
  get orientation() { return 'vertical'; }
}
