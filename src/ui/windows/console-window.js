// ConsoleWindow: the language-neutral base for consoles - an HSplitWindow
// with source on the left, output on the right, and Run, Clear Output and
// Clear Input buttons. Subclasses supply the language: a title prefix, the
// starting source, and run().

import { HSplitWindow } from './hsplit-window.js';
import { TextPanel } from '../widgets/text-panel.js';

// Every console, of any language, cascades from the same starting point.
let opened = 0;
// Each subclass numbers its own windows: Basic Console, Basic Console 2, ...
const counts = new Map();

export class ConsoleWindow extends HSplitWindow {
  /** The title prefix, e.g. 'Basic Console'. Subclasses override. */
  static get titlePrefix() { return 'Console'; }

  /**
   * Creates the source pane. Subclasses may override to supply a different
   * TextPanel, such as a MonacoPanel with syntax highlighting.
   */
  createInput(text) {
    return new TextPanel({ text });
  }

  /** The source a new console starts with. Subclasses override. */
  static get defaultText() { return ''; }

  constructor(options = {}) {
    const cls = new.target;
    const n = counts.get(cls) ?? 0;
    counts.set(cls, n + 1);
    const offset = (opened++ % 8) * 24;   // cascade each new console
    super({
      title: n === 0 ? cls.titlePrefix : `${cls.titlePrefix} ${n + 1}`,
      x: 440 + offset, y: 55 + offset, width: 560, height: 320,
      ...options,
    });
    this.element.classList.add('cr-console-window');
    this.input = this.createInput(options.text ?? cls.defaultText);
    this.output = new TextPanel({ readOnly: true });
    this.output.textArea.style.background = '#f7f7f7';
    this.left = this.input;
    this.right = this.output;

    this.buttonBar.addButton('Run', () => this.run());
    this.buttonBar.addButton('Clear Output', () => { this.output.text = ''; });
    this.buttonBar.addButton('Clear Input', () => { this.input.text = ''; this.input.focus(); });

    // Ctrl+Enter in the source runs the code.
    this.input.element.addEventListener('submit', () => this.run());
  }

  /** Runs the source in the left pane. The base class does nothing. */
  run() {
    return null;
  }

  /** Stops this console's program, if one is running. The base has none. */
  stop() {}

  close() {
    const closed = super.close();
    if (closed) this.stop();
    return closed;
  }
}
