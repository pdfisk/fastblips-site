// PythonConsoleWindow: a ConsoleWindow that runs MiniPy - the Python subset
// compiled by src/vm/compiler/python - edited in a Monaco editor with Python
// syntax highlighting.

import { ConsoleWindow } from './console-window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { run as runPython } from '../../vm/compiler/python/loader.js';

// The MiniPy VM runs to completion in one go rather than on the scheduler, so
// the budget is what stops a runaway loop from hanging the tab.
const MAX_STEPS = 5_000_000;

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
  }

  /**
   * Compiles and runs the source in the left pane, writing its output - and
   * any load errors or runtime fault - to the right pane. Returns the run
   * result, or null if the program did not compile.
   */
  run() {
    const source = this.input.text;
    const filename = 'console.py';
    this.output.text = '';

    const result = runPython(source, { filename, maxSteps: MAX_STEPS });

    if (!result.ok && result.loadErrors.length > 0) {
      this.output.text = `${result.loadErrors.join('\n')}\n`;
      return null;
    }
    if (result.output.length > 0) this.output.append(`${result.output.join('\n')}\n`);
    if (result.error) this.output.append(`${result.error}\n`);
    return result;
  }
}
