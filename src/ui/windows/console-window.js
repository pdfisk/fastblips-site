// ConsoleWindow: an HSplitWindow for running Crumb code - source on the
// left, output on the right, with Run, Clear Output and Clear Input buttons.

import { HSplitWindow } from './hsplit-window.js';
import { TextPanel } from '../widgets/text-panel.js';
import { run } from '../../index.js';
import { formatDiagnostics } from '../../vm/diagnostics.js';

let count = 0;

export class ConsoleWindow extends HSplitWindow {
  constructor(options = {}) {
    const n = count++;
    const offset = (n % 8) * 24;   // cascade each new console
    super({
      title: n === 0 ? 'Console' : `Console ${n + 1}`,
      x: 440 + offset, y: 55 + offset, width: 560, height: 320,
      ...options,
    });
    this.element.classList.add('cr-console-window');
    this.input = new TextPanel({ text: options.text ?? 'Print "Hello, world"\n' });
    this.output = new TextPanel({ readOnly: true });
    this.output.textArea.style.background = '#f7f7f7';
    this.left = this.input;
    this.right = this.output;

    this.buttonBar.addButton('Run', () => this.run());
    this.buttonBar.addButton('Clear Output', () => { this.output.text = ''; });
    this.buttonBar.addButton('Clear Input', () => { this.input.text = ''; this.input.textArea.focus(); });

    // Ctrl+Enter runs the code.
    this.input.textArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.run(); }
    });
  }

  /** Runs the source in the left pane and shows the result on the right. */
  run() {
    const source = this.input.text;
    const filename = 'console.crumb';
    const result = run(source, { filename });
    const lines = [...result.output];
    if (result.loadErrors.length > 0) {
      lines.push(formatDiagnostics(result.loadErrors, source, filename));
    } else if (result.error) {
      lines.push(formatDiagnostics([result.error], source, filename));
    }
    this.output.text = lines.join('\n');
    return result;
  }
}
