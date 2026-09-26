// ProgramRunner: runs one program's source on the shared scheduler and prints
// to a TextPanel. It is what the Go and Reset buttons do, in LaunchWindows and
// on the ?run= page (see docs/widgets.txt).

import { StatusBar } from './widgets/status-bar.js';
import { scheduler } from './runtime.js';

export class ProgramRunner {
  /**
   * @param {object} options
   * @param {Function|null} options.language - the ConsoleWindow class whose
   *   static spawn() compiles and runs the source (BasicConsoleWindow or
   *   PythonConsoleWindow); null runs nothing.
   * @param {string} options.source - the program
   * @param {import('./widgets/text-panel.js').TextPanel} [options.output]
   * @param {import('./widgets/app-screen.js').AppScreen} [options.screen] -
   *   the screen the program runs on: its text panel is the output, and it
   *   hosts the program's widgets. Give a screen or an output.
   * @param {string|(() => string)} options.name - shown in the scheduler
   *   and in StatusBar messages
   */
  constructor({ language = null, source = '', output = null, screen = null, name = 'Program' } = {}) {
    this.language = language;
    this.source = String(source ?? '');
    this.screen = screen;
    this.output = output ?? screen?.textPanel;
    this._name = name;
    this.process = null;
  }

  get name() { return typeof this._name === 'function' ? this._name() : this._name; }

  /**
   * Go: stops any previous run, clears the output and the widgets, and
   * starts the source.
   * Returns the Process, or null if there were load errors.
   */
  go() {
    this.reset();
    if (!this.language) return null;
    const name = this.name;
    const { process, errorCount } = this.language.spawn(this.source, {
      name,
      output: this.output,
      gui: this.screen?.host ?? null,
      onExit: (p) => this._reportExited(p, name),
    });
    if (!process) {
      if (errorCount) {
        StatusBar.instance.show(`${name}: ${errorCount} load error${errorCount === 1 ? '' : 's'}`, 'error');
      }
      return null;
    }
    this.process = process;
    StatusBar.instance.show(`${name}: running (pid ${process.pid})`);
    scheduler.start();
    return process;
  }

  /** Stops the program, if it is running. */
  stop() {
    if (this.process && !this.process.finished) scheduler.kill(this.process.pid);
    this.process = null;
  }

  /** Reset: stops the program, clears the output and removes the
   *  program's widgets. */
  reset() {
    this.stop();
    this.output.text = '';
    this.screen?.clearWidgets();
  }

  _reportExited(process, name) {
    if (process !== this.process) return;   // a run that was stopped
    const bar = StatusBar.instance;
    if (process.state === 'failed') bar.show(`${name}: stopped with an error`, 'error');
    else if (process.state === 'killed') bar.show(`${name}: stopped`);
    else bar.show(`${name}: finished in ${process.vm.steps} steps`);
  }
}
