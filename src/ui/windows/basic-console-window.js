// BasicConsoleWindow: a ConsoleWindow that runs Crumb code, edited in a
// Monaco editor with VB.NET syntax highlighting.

import { ConsoleWindow } from './console-window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { TranscriptWindow } from './transcript-window.js';
import { compile } from '../../index.js';
import { formatDiagnostics } from '../../vm/compiler/basic/diagnostics.js';
import { scheduler } from '../runtime.js';
import { loadProgram } from '../../vm/program-loader.js';

// Programs from every console share one scheduler (see ../runtime.js), so they
// take turns, and a Sleep in one never blocks the page or the others.
export { scheduler };

export class BasicConsoleWindow extends ConsoleWindow {
  static get titlePrefix() { return 'Basic Console'; }

  static get fileTypes() {
    return [{ description: 'Crumb Basic source', accept: { 'text/plain': ['.bas'] } }];
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
   * Spawns a Crumb program on the shared scheduler, printing to output (a
   * TextPanel) and putting widgets on gui (an AppScreen's host, or a console's ConsoleOutputHost), if given.
   * The program runs from its compiled code when that is given and still
   * matches the source, else from this page's compile cache, else the source
   * is compiled (see src/vm/program-loader.js). Load errors are written to
   * output instead. priority is the process's priority, 1 (highest) to 5.
   * Does not start the scheduler. Used by run() and by LaunchWindow.
   * @returns {{process: object|null, errorCount: number, origin: string|null}}
   */
  static spawn(source, {
    name, output, gui = null, filename = 'console.bas', onExit, priority, compiled = null,
  } = {}) {
    const { chunk, errors, errorCount, origin } = loadProgram({
      language: 'crumb', source, compiled, filename,
      compile: (text, file) => BasicConsoleWindow.compileSource(text, file),
    });
    if (!chunk) {
      output.text = errors;
      return { process: null, errorCount, origin: null };
    }
    const process = scheduler.spawn(chunk, {
      name,
      gui,
      priority,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (p) => {
        if (p.error) output.append(`${formatDiagnostics([p.error], source, filename)}\n`);
        onExit?.(p);
      },
    });
    process.origin = origin;
    return { process, errorCount: 0, origin };
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
    this.resetOutput();
    const { process, errorCount } = BasicConsoleWindow.spawn(this.input.text, {
      name: this.title,
      output: this.output,
      gui: this.outputHost,
      priority: this.priority,
      compiled: this.compiled,
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
  static compileSource(source, filename = 'console.bas') {
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
