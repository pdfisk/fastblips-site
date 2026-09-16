// ConsoleWindow: an HSplitWindow for running Crumb code - source on the
// left, output on the right, with Run, Clear Output and Clear Input buttons.

import { HSplitWindow } from './hsplit-window.js';
import { TextPanel } from '../widgets/text-panel.js';
import { TranscriptWindow } from './transcript-window.js';
import { compile } from '../../index.js';
import { formatDiagnostics } from '../../vm/diagnostics.js';
import { Scheduler } from '../../scheduling/scheduler.js';

let count = 0;

// One scheduler shared by every console, so programs in different consoles
// take turns, and a Sleep in one never blocks the page or the others.
export const scheduler = new Scheduler({ quantum: 1000 });

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

  /**
   * Compiles the source in the left pane and starts it on the shared
   * scheduler; output appears on the right as the program runs. Running again
   * stops this console's previous program. Returns the Process, or null if
   * there were load errors.
   */
  run() {
    const source = this.input.text;
    const filename = 'console.crumb';
    this.stop();
    this.output.text = '';

    const { chunk, errors } = compile(source, { filename });
    if (!chunk || errors.length > 0) {
      this.output.text = formatDiagnostics(errors, source, filename);
      return null;
    }

    const output = this.output;
    this.process = scheduler.spawn(chunk, {
      name: this.title,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (process) => {
        if (process.error) output.append(`${formatDiagnostics([process.error], source, filename)}\n`);
      },
    });
    scheduler.start();
    return this.process;
  }

  /** Stops this console's program, if one is running. */
  stop() {
    if (this.process && !this.process.finished) scheduler.kill(this.process.pid);
    this.process = null;
  }

  close() {
    const closed = super.close();
    if (closed) this.stop();
    return closed;
  }
}
