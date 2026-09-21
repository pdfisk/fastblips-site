// BasicConsoleWindow: a ConsoleWindow that runs Crumb code, edited in a
// Monaco editor with VB.NET syntax highlighting.

import { ConsoleWindow } from './console-window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { TranscriptWindow } from './transcript-window.js';
import { compile } from '../../index.js';
import { formatDiagnostics } from '../../vm/compiler/basic/diagnostics.js';
import { scheduler } from '../runtime.js';

// Programs from every console share one scheduler (see ../runtime.js), so they
// take turns, and a Sleep in one never blocks the page or the others.
export { scheduler };

export class BasicConsoleWindow extends ConsoleWindow {
  static get titlePrefix() { return 'Basic Console'; }
  static get defaultText() { return 'Print "Hello, world"\n'; }

  /** The source is edited in Monaco, highlighted as VB.NET. */
  createInput(text) {
    return new MonacoPanel({ text, language: 'vb' });
  }

  constructor(options = {}) {
    super(options);
    this.element.classList.add('cr-basic-console-window');
    this.process = null;
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
      this.reportLoadErrors(errors.length);
      return null;
    }

    const output = this.output;
    this.process = scheduler.spawn(chunk, {
      name: this.title,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (process) => {
        if (process.error) output.append(`${formatDiagnostics([process.error], source, filename)}\n`);
        this.reportExited(process);
      },
    });
    this.reportStarted(this.process);
    scheduler.start();
    return this.process;
  }

  /** Stops this console's program, if one is running. */
  stop() {
    if (this.process && !this.process.finished) scheduler.kill(this.process.pid);
    this.process = null;
  }
}
