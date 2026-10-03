// AppScreen: the screen a program runs on, in a LaunchWindow and on the
// ?run= page (see docs/widgets.txt). A TextPanel fills it (the program's
// Print output), and the widgets the program makes (New Button, New Label,
// ...) float above the text at the positions it gives them. Between the
// two is the program's Board (New Board() / Board()), a BoardPanel that
// covers the text once the program uses it.
//
// screen.host (a ProgramWidgetHost, ../program-widgets.js) is the VM's
// widget host, its `gui` option: it implements create / has / classOf /
// call, as described in src/vm/runtime/widgets.js.

import { Panel } from './panel.js';
import { TextPanel } from './text-panel.js';
import { BoardPanel } from './board-panel.js';
import { FreeLayer, ProgramWidgetHost } from '../program-widgets.js';

export class AppScreen extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-app-screen');
    this.element.style.background = 'var(--cr-output-bg)';
    this.textPanel = this.add(new TextPanel());
    // Hidden until the program makes its Board.
    this.boardPanel = this.add(new BoardPanel());
    this.boardPanel.visible = false;
    this.widgetLayer = this.add(new FreeLayer());
    /** The VM's widget host (pass it as the `gui` option). */
    this.host = new ProgramWidgetHost(this.widgetLayer, { board: this.boardPanel });
  }

  layout() {
    const { width, height } = this.bounds;
    this.textPanel.setBounds(0, 0, width, height);
    this.boardPanel.setBounds(0, 0, width, height);
    this.widgetLayer.setBounds(0, 0, width, height);
    super.layout();
  }

  /** Removes every widget the program added, and hides and empties its
   *  board (Go and Reset do this). */
  clearWidgets() { this.host.clear(); }

  /** An AppScreen holds only its text, its board and its widget layer. */
  add(child) {
    if (this.children.length >= 3) throw new Error('AppScreen cannot contain other widgets');
    return super.add(child);
  }
}
