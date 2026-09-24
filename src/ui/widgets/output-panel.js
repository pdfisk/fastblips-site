// OutputPanel: where a program's output goes - a TabPanel with its labels
// along the bottom and three pages: Text, Board and Canvas
// (see docs/widgets.txt).

import { Panel } from './panel.js';
import { TabPanel } from './tab-panel.js';
import { TextPanel } from './text-panel.js';
import { BoardPanel } from './board-panel.js';
import { CanvasPanel } from './canvas-panel.js';

export class OutputPanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-output-panel');
    this.tabPanel = super.add(new TabPanel({ tabPosition: 'bottom' }));
    this.textPanel = this.tabPanel.addTab('Text', new TextPanel({ readOnly: true }));
    this.textPanel.textArea.style.background = 'var(--cr-output-bg)';
    this.boardPanel = this.tabPanel.addTab('Board', new BoardPanel());
    this.canvasPanel = this.tabPanel.addTab('Canvas', new CanvasPanel());
  }

  /** The label of the tab showing: 'Text', 'Board' or 'Canvas'. */
  get selectedTab() { return this.tabPanel.selectedLabel; }

  /** Shows the tab with this label. */
  selectTab(label) { this.tabPanel.select(label); }

  /** Empties all three pages. */
  clear() {
    this.textPanel.text = '';
    this.boardPanel.clear();
    this.canvasPanel.clear();
  }

  /** An OutputPanel holds only its TabPanel. */
  add() {
    throw new Error('OutputPanel cannot contain other widgets');
  }

  layout() {
    const { width, height } = this.bounds;
    this.tabPanel.setBounds(0, 0, width, height);
    super.layout();
  }
}
