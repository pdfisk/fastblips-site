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

  static get fileTypes() {
    return [{ description: 'Crumb Basic source', accept: { 'text/plain': ['.crumb', '.bas'] } }];
  }
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
   * Compiles Crumb source and spawns it on the shared scheduler, printing to
   * output (a TextPanel) and putting widgets on gui (an AppScreen's host), if given. Load errors are written to output instead. Does
   * not start the scheduler. Used by run() and by LaunchWindow.
   * @returns {{process: object|null, errorCount: number}}
   */
  static spawn(source, { name, output, gui = null, filename = 'console.crumb', onExit } = {}) {
    const { chunk, errors } = compile(source, { filename });
    if (!chunk || errors.length > 0) {
      output.text = formatDiagnostics(errors, source, filename);
      return { process: null, errorCount: errors.length };
    }
    const process = scheduler.spawn(chunk, {
      name,
      gui,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (p) => {
        if (p.error) output.append(`${formatDiagnostics([p.error], source, filename)}\n`);
        onExit?.(p);
      },
    });
    return { process, errorCount: 0 };
  }

  /**
   * Compiles the source in the left pane and starts it on the shared
   * scheduler; output appears on the right as the program runs. Running again
   * stops this console's previous program. Returns the Process, or null if
   * there were load errors.
   */
  run() {
    this.stop();
    this.output.text = '';
    const { process, errorCount } = BasicConsoleWindow.spawn(this.input.text, {
      name: this.title,
      output: this.output,
      onExit: (p) => this.reportExited(p),
    });
    if (!process) {
      this.reportLoadErrors(errorCount);
      return null;
    }
    this.process = process;
    this.reportStarted(process);
    scheduler.start();
    return process;
  }

  /** Compiles Crumb source without running it (a DatabaseWindow's Compile button). */
  static compileSource(source, filename = 'console.crumb') {
    const { chunk, errors } = compile(source, { filename });
    if (!chunk || errors.length > 0) {
      return { chunk: null, errors: formatDiagnostics(errors, source, filename), errorCount: errors.length };
    }
    return { chunk, errors: '', errorCount: 0 };
  }

  /** Stops this console's program, if one is running. */
  stop() {
    if (this.process && !this.process.finished) scheduler.kill(this.process.pid);
    this.process = null;
  }
}
