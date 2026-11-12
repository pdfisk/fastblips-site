// PythonConsoleWindow: a ConsoleWindow that runs BlipPy - the Python subset
// compiled by src/vm/compiler/python - edited in a Monaco editor with Python
// syntax highlighting.
//
// BlipPy compiles to the same bytecode as Crumb and runs on the same VM, so
// its programs go on the shared scheduler too: they take turns with Crumb
// programs, sleep() never blocks the page, and the Process window can
// suspend or kill them.
//
// It is also a small debugger. Breakpoints are set in the editor's margin,
// and a program stops at them while Stop at breakpoints is ticked. The Run
// button's arrow gives three ways to run:
//   Run          - at full speed
//   Single step  - one line, then stop, with the next line highlighted
//   Run stepping - a line at a time, on its own, highlighting each line
// Choosing one while the program is stopped carries it on that way.

import { ConsoleWindow } from './console-window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { TranscriptWindow } from './transcript-window.js';
import { StatusBar } from '../widgets/status-bar.js';
import {
  compile as compilePython, formatLoadErrors, formatFault, DEFAULT_MAX_DEPTH,
} from '../../vm/compiler/python/loader.js';
import { scheduler } from '../runtime.js';
import { loadProgram } from '../../vm/program-loader.js';

/** How long Run stepping shows each line before running it, in milliseconds. */
export const STEP_DELAY = 400;

export class PythonConsoleWindow extends ConsoleWindow {
  static get titlePrefix() { return 'Python Console'; }

  static get fileTypes() {
    return [{ description: 'Python source', accept: { 'text/x-python': ['.py'] } }];
  }
  static get defaultText() { return 'print("Hello, world")\n'; }

  /** The source is edited in Monaco, highlighted as Python, with a margin
   *  for breakpoints. */
  createInput(text) {
    return new MonacoPanel({ text, language: 'python', breakpoints: true });
  }

  constructor(options = {}) {
    super(options);
    this.element.classList.add('cr-python-console-window');
    this.process = null;
    // How the program is being run: 'run', 'step' (Single step) or
    // 'stepping' (Run stepping).
    this.mode = 'run';
    this.stepDelay = options.stepDelay ?? STEP_DELAY;
    this.pausedLine = null;    // the line the program is stopped at, if it is
    this._stepTimer = null;    // Run stepping's wait before the next line
    // The running program's VM reads these as it runs (VM.checkDebug).
    this.debug = { breakpoints: new Set(), stopAtBreakpoints: false, stepping: false };
    this.breakpointsBox.element.addEventListener('change', () => this._applyDebug());
    this.input.element.addEventListener('breakpointschange', () => this._applyDebug());
    this.input.element.addEventListener('step', () => this.singleStep());   // F10
  }

  /**
   * Spawns a BlipPy program on the shared scheduler, printing to output (a
   * TextPanel) and putting widgets on gui (an AppScreen's host, or a console's ConsoleOutputHost), if given.
   * The program runs from its compiled code when that is given and still
   * matches the source, else from this page's compile cache, else the source
   * is compiled (see src/vm/program-loader.js). Load errors are written to
   * output instead. priority is the process's priority, 1 (highest) to 5.
   * debug and onPause are a debugger's: the VM's debug settings, and what to
   * call when the program stops at a breakpoint or after a step.
   * Does not start the scheduler. Used by run() and by LaunchWindow.
   * @returns {{process: object|null, errorCount: number, origin: string|null}}
   */
  static spawn(source, {
    name, output, gui = null, filename = 'console.py', onExit, priority, compiled = null,
    debug = null, onPause = null,
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
      debug,
      onPause,
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
   * Run. Compiles the source in the left pane and starts it on the shared
   * scheduler; output appears on the right as the program runs. Running again
   * stops this console's previous program and starts afresh - unless the
   * program is stopped at a line or being stepped, when it carries on at
   * full speed. Returns the Process, or null if there were load errors.
   */
  run() {
    return this._run('run');
  }

  /**
   * Single step. Runs one line and stops before the next, which is
   * highlighted. With no program running it starts one, stopped before its
   * first line; a program running at full speed stops at its next line.
   */
  singleStep() {
    return this._run('step');
  }

  /**
   * Run stepping. Runs the program a line at a time, highlighting each line
   * for stepDelay milliseconds before it runs. It stops at breakpoints (if
   * Stop at breakpoints is ticked); Single step stops it anywhere.
   */
  runStepping() {
    return this._run('stepping');
  }

  /** Starts the program in a mode, or carries the one in hand on in it. */
  _run(mode) {
    const process = this.process;
    const active = process && !process.finished;
    const runningFree = this.mode === 'run' && this.pausedLine === null;
    if (!active || (mode === 'run' && runningFree)) return this._start(mode);
    this.mode = mode;
    this._applyDebug();
    if (mode === 'run') this.input.debugLine = null;
    this._resume();
    return process;
  }

  _start(mode) {
    this.stop();
    this.output.text = '';
    this.resetOutput();
    this.mode = mode;
    const { process, errorCount } = PythonConsoleWindow.spawn(this.input.text, {
      name: this.title,
      output: this.output,
      gui: this.outputHost,
      priority: this.priority,
      compiled: this.compiled,
      debug: this.debug,
      onPause: (p) => this._paused(p),
      onExit: (p) => {
        if (p === this.process) this._clearPause();
        this.reportExited(p);
      },
    });
    if (!process) {
      this.reportLoadErrors(errorCount);
      return null;
    }
    this.process = process;
    this._applyDebug();
    this.reportStarted(process);
    scheduler.start();
    return process;
  }

  /**
   * Brings the debug settings up to date with the mode, the check box and
   * the editor's breakpoints. A program that needs none of them runs with
   * no debugger at all (vm.debug null), at full speed.
   */
  _applyDebug() {
    const debug = this.debug;
    debug.breakpoints = new Set(this.input.breakpoints ?? []);
    debug.stopAtBreakpoints = this.stopAtBreakpoints && debug.breakpoints.size > 0;
    debug.stepping = this.mode !== 'run';
    const process = this.process;
    if (process && !process.finished) {
      process.vm.debug = debug.stepping || debug.stopAtBreakpoints ? debug : null;
    }
  }

  /** The program has stopped at a line (the Process's onPause). */
  _paused(process) {
    if (process !== this.process) return;
    const { line, reason } = process.vm.paused;
    this.pausedLine = line;
    this.input.debugLine = line;
    if (this.mode === 'stepping' && reason !== 'breakpoint') {
      // Show the line for a moment, then run it.
      this._stepTimer = setTimeout(() => this._resume(), this.stepDelay);
      return;
    }
    StatusBar.instance.show(`${this.title}: stopped at line ${line}${reason === 'breakpoint' ? ' (breakpoint)' : ''}`);
  }

  /** Carries a stopped program on from its line. */
  _resume() {
    clearTimeout(this._stepTimer);
    this._stepTimer = null;
    if (this.pausedLine === null) return;
    this.pausedLine = null;
    const process = this.process;
    if (!process || process.finished) return;
    scheduler.resume(process.pid);
    scheduler.start();
  }

  _clearPause() {
    clearTimeout(this._stepTimer);
    this._stepTimer = null;
    this.pausedLine = null;
    this.input.debugLine = null;
  }

  /** Compiles BlipPy source without running it (a DatabaseWindow's Compile button). */
  static compileSource(source, filename = 'console.py') {
    const { chunk, loadErrors } = compilePython(source, { filename });
    if (!chunk) {
      return { chunk: null, errors: `${formatLoadErrors(loadErrors, filename).join('\n')}\n`, errorCount: loadErrors.length };
    }
    return { chunk, errors: '', errorCount: 0 };
  }

  /** Stops this console's program, if one is running. */
  stop() {
    this._clearPause();
    if (this.process && !this.process.finished) scheduler.kill(this.process.pid);
    this.process = null;
  }
}
