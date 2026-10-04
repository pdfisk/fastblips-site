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
import { loadProgram } from '../../vm/program-loader.js';

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
   * Spawns a MiniPy program on the shared scheduler, printing to output (a
   * TextPanel) and putting widgets on gui (an AppScreen's host, or a console's ConsoleOutputHost), if given.
   * The program runs from its compiled code when that is given and still
   * matches the source, else from this page's compile cache, else the source
   * is compiled (see src/vm/program-loader.js). Load errors are written to
   * output instead. priority is the process's priority, 1 (highest) to 5.
   * Does not start the scheduler. Used by run() and by LaunchWindow.
   * @returns {{process: object|null, errorCount: number, origin: string|null}}
   */
  static spawn(source, {
    name, output, gui = null, filename = 'console.py', onExit, priority, compiled = null,
  } = {}) {
    const { chunk, errors, errorCount, origin } = loadProgram({
      language: 'python', source, compiled, filename,
      compile: (text, file) => PythonConsoleWindow.compileSource(text, file),
    });
    if (!chunk) {
      output.text = errors;
      return { process: null, errorCount, origin: null };
    }
    const process = scheduler.spawn(chunk, {
      name,
      gui,
      priority,
      maxDepth: DEFAULT_MAX_DEPTH,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (p) => {
        if (p.error) output.append(`${formatFault(p.error, source, filename)}\n`);
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
    const { process, errorCount } = PythonConsoleWindow.spawn(this.input.text, {
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
