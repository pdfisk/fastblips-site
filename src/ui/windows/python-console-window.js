// PythonConsoleWindow: a ConsoleWindow for Python code. There is no Python
// runtime yet, so Run does nothing.

import { ConsoleWindow } from './console-window.js';

export class PythonConsoleWindow extends ConsoleWindow {
  static get titlePrefix() { return 'Python Console'; }
  static get defaultText() { return 'print("Hello, world")\n'; }

  constructor(options = {}) {
    super(options);
    this.element.classList.add('cr-python-console-window');
  }

  /** Not implemented yet: does nothing. */
  run() {
    return null;
  }
}
