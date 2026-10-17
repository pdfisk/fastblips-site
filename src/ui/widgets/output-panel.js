// OutputPanel: where a program's output goes - a TabPanel with its labels
// along the bottom and four pages: Text, Board, Canvas and Physics
// (see docs/widgets.txt).

import { Panel } from './panel.js';
import { TabPanel } from './tab-panel.js';
import { TextPanel } from './text-panel.js';
import { BoardPanel } from './board-panel.js';
import { CanvasPanel } from './canvas-panel.js';
import { PhysicsPanel } from './physics-panel.js';

export class OutputPanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-output-panel');
    this.tabPanel = super.add(new TabPanel({ tabPosition: 'bottom' }));
    // The Text page is writeable: the user can type notes into the output, or
    // edit it, and programs keep printing at its end.
    this.textPanel = this.tabPanel.addTab('Text', new TextPanel());
    this.textPanel.textArea.style.background = 'var(--cr-output-bg)';
    this.boardPanel = this.tabPanel.addTab('Board', new BoardPanel());
    this.canvasPanel = this.tabPanel.addTab('Canvas', new CanvasPanel());
    this.physicsPanel = this.tabPanel.addTab('Physics', new PhysicsPanel());
  }

  /** The label of the tab showing: 'Text', 'Board', 'Canvas' or 'Physics'. */
  get selectedTab() { return this.tabPanel.selectedLabel; }

  /** Shows the tab with this label. */
  selectTab(label) { this.tabPanel.select(label); }

  /** Empties the Text, Board and Canvas pages and puts the Physics ball back. */
  clear() {
    this.textPanel.text = '';
    this.boardPanel.clear();
    this.canvasPanel.clear();
    this.physicsPanel.clear();
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
