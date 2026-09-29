// PythonConsoleWindow: a ConsoleWindow that runs MiniPy - the Python subset
// compiled by src/vm/compiler/python - edited in a Monaco editor with Python
// syntax highlighting.
//
// MiniPy compiles to the same bytecode as Crumb and runs on the same VM, so
// its programs go on the shared scheduler too: they take turns with Crumb
// programs, sleep() never blocks the page, and the Process window can
// suspend or kill them.

import { ConsoleWindow } from './console-window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { TranscriptWindow } from './transcript-window.js';
import {
  compile as compilePython, formatLoadErrors, formatFault, DEFAULT_MAX_DEPTH,
} from '../../vm/compiler/python/loader.js';
import { scheduler } from '../runtime.js';

export class PythonConsoleWindow extends ConsoleWindow {
  static get titlePrefix() { return 'Python Console'; }

  static get fileTypes() {
    return [{ description: 'Python source', accept: { 'text/x-python': ['.py'] } }];
  }
  static get defaultText() { return 'print("Hello, world")\n'; }

  /** The source is edited in Monaco, highlighted as Python. */
  createInput(text) {
    return new MonacoPanel({ text, language: 'python' });
  }

  constructor(options = {}) {
    super(options);
    this.element.classList.add('cr-python-console-window');
    this.process = null;
  }

  /**
   * Compiles MiniPy source and spawns it on the shared scheduler, printing
   * to output (a TextPanel) and putting widgets on gui (an AppScreen's host), if given. Load errors are written to output instead. Does
   * not start the scheduler. Used by run() and by LaunchWindow.
   * @returns {{process: object|null, errorCount: number}}
   */
  static spawn(source, { name, output, gui = null, filename = 'console.py', onExit } = {}) {
    const { chunk, loadErrors } = compilePython(source, { filename });
    if (!chunk) {
      output.text = `${formatLoadErrors(loadErrors, filename).join('\n')}\n`;
      return { process: null, errorCount: loadErrors.length };
    }
    const process = scheduler.spawn(chunk, {
      name,
      gui,
      maxDepth: DEFAULT_MAX_DEPTH,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (p) => {
        if (p.error) output.append(`${formatFault(p.error, source, filename)}\n`);
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
    const { process, errorCount } = PythonConsoleWindow.spawn(this.input.text, {
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

  /** Compiles MiniPy source without running it (a DatabaseWindow's Compile button). */
  static compileSource(source, filename = 'console.py') {
    const { chunk, loadErrors } = compilePython(source, { filename });
    if (!chunk) {
      return { chunk: null, errors: `${formatLoadErrors(loadErrors, filename).join('\n')}\n`, errorCount: loadErrors.length };
    }
    return { chunk, errors: '', errorCount: 0 };
  }

  /** Stops this console's program, if one is running. */
  stop() {
    if (this.process && !this.process.finished) scheduler.kill(this.process.pid);
    this.process = null;
  }
}
