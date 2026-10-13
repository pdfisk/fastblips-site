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
   * @param {string|object|(() => string|object)} [options.compiled] - compiled
   *   code for the source (a record's compiled_code), run instead of
   *   compiling the source while it still matches it
   * @param {number|(() => number)} [options.priority] - the process's
   *   priority, 1 (highest) to 5 (lowest); the scheduler's default if absent
   */
  constructor({
    language = null, source = '', output = null, screen = null, name = 'Program', compiled = null, priority,
  } = {}) {
    this.language = language;
    this.source = String(source ?? '');
    this._compiled = compiled;
    this._priority = priority;
    this.screen = screen;
    this.output = output ?? screen?.textPanel;
    this._name = name;
    this.process = null;
  }

  get name() { return typeof this._name === 'function' ? this._name() : this._name; }

  get compiled() { return typeof this._compiled === 'function' ? this._compiled() : this._compiled; }

  get priority() { return typeof this._priority === 'function' ? this._priority() : this._priority; }

  /**
   * Go: stops any previous run, clears the output and the widgets, and
   * starts the source.
   * Returns the Process, or null if there were load errors.
   */
  go() {
    this.reset();
    return this.start();
  }

  /**
   * Starts the source without clearing the output or the widgets first
   * (go() does both, then this). Returns the Process, or null if there were
   * load errors.
   */
  start() {
    this.stop();
    if (!this.language) return null;
    const name = this.name;
    const { process, errorCount } = this.language.spawn(this.source, {
      name,
      output: this.output,
      gui: this.screen?.host ?? null,
      compiled: this.compiled,
      priority: this.priority ?? undefined,
      onExit: (p) => this._reportExited(p, name),
    });
    if (!process) {
      if (errorCount) {
        StatusBar.instance.show(`${name}: ${errorCount} load error${errorCount === 1 ? '' : 's'}`, 'error');
      }
      return null;
    }
    this.process = process;
    StatusBar.instance.show(`${name}: running (pid ${process.pid}${describeOrigin(process.origin)})`);
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

/**
 * ProgramSetRunner: runs several programs together on one screen - a
 * project's scripts - with the same go/stop/reset interface as a
 * ProgramRunner. Go clears the screen once, then starts the programs in
 * order on the shared scheduler, so they run side by side, printing to the
 * same text panel and putting their widgets on the same screen.
 */
export class ProgramSetRunner {
  /**
   * @param {object} options
   * @param {object[]|(() => object[])} options.programs - one
   *   { name, language, source, compiled, priority } per program, in order;
   *   see ProgramRunner for what they mean
   * @param {import('./widgets/app-screen.js').AppScreen} options.screen
   */
  constructor({ programs = [], screen } = {}) {
    this._programs = programs;
    this.screen = screen;
    this.output = screen.textPanel;
    this.runners = [];
  }

  get programs() { return typeof this._programs === 'function' ? this._programs() : this._programs; }

  /** The Processes started, in order (none for a program with load errors). */
  get processes() { return this.runners.map((r) => r.process).filter(Boolean); }

  /** The last Process started, or null. */
  get process() { return this.processes.at(-1) ?? null; }

  /**
   * Stops any previous run, clears the output and the widgets, and starts
   * every program in order. Returns the Processes started.
   */
  go() {
    this.reset();
    this.runners = this.programs.map((p) => new ProgramRunner({ ...p, screen: this.screen }));
    for (const runner of this.runners) runner.start();
    return this.processes;
  }

  /** Stops the programs that are running. */
  stop() {
    for (const runner of this.runners) runner.stop();
  }

  /** Stops the programs, clears the output and removes their widgets. */
  reset() {
    this.stop();
    this.output.text = '';
    this.screen.clearWidgets();
  }
}

/** ", compiled code" or ", cached" for a StatusBar message; '' when compiled from source. */
export function describeOrigin(origin) {
  if (origin === 'compiled') return ', compiled code';
  if (origin === 'cache') return ', cached';
  return '';
}
