// PythonConsoleWindow: a ConsoleWindow that runs MiniPy - the Python subset
// compiled by src/vm/compiler/python - edited in a Monaco editor with Python
// syntax highlighting.
//
// MiniPy compiles to the same bytecode as Crumb and runs on the same VM, so
// its programs go on the shared scheduler too: they take turns with Crumb
// programs, sleep() never blocks the page, and the Scheduler window can
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
   * Compiles the source in the left pane and starts it on the shared
   * scheduler; output appears on the right as the program runs. Running again
   * stops this console's previous program. Returns the Process, or null if
   * there were load errors.
   */
  run() {
    const source = this.input.text;
    const filename = 'console.py';
    this.stop();
    this.output.text = '';

    const { chunk, loadErrors } = compilePython(source, { filename });
    if (!chunk) {
      this.output.text = `${formatLoadErrors(loadErrors, filename).join('\n')}\n`;
      return null;
    }

    const output = this.output;
    this.process = scheduler.spawn(chunk, {
      name: this.title,
      maxDepth: DEFAULT_MAX_DEPTH,
      out: (text) => output.append(`${text}\n`),
      transcript: (text) => TranscriptWindow.instance.textPanel.append(`${text}\n`),
      onExit: (process) => {
        if (process.error) output.append(`${formatFault(process.error, source, filename)}\n`);
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
}
