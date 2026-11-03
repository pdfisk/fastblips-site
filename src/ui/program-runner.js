// ProgramRunner: runs one program's source on the shared scheduler and prints
// to a TextPanel. It is what the Go and Reset buttons do, in LaunchWindows and
// on the ?app= page (see docs/widgets.txt).

import { StatusBar } from './widgets/status-bar.js';
import { scheduler } from './runtime.js';
import { chunkToJson, sourceHash } from '../vm/chunk-json.js';

export class ProgramRunner {
  /**
   * @param {object} options
   * @param {Function|null} options.language - the ConsoleWindow class whose
   *   static spawn() compiles and runs the source (
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
    this._recompiled = null;   // set by recompile()
    this._priority = priority;
    this.screen = screen;
    this.output = output ?? screen?.textPanel;
    this._name = name;
    this.process = null;
  }

  get name() { return typeof this._name === 'function' ? this._name() : this._name; }

  /** The compiled code a run uses: recompile()'s, else the one given. */
  get compiled() {
    if (this._recompiled) return this._recompiled;
    return typeof this._compiled === 'function' ? this._compiled() : this._compiled;
  }

  /** The source each run uses, as a one-item list (as ProgramSetRunner's). */
  get sources() { return [this.source]; }

  /**
   * Compiles the source afresh (a launch window's Compile button), without
   * running it: sources[0] if given (the source as edited), else the current
   * source. On success that becomes the source, and its new code is used by
   * every later Go, in place of the compiled code given and of this page's
   * compile cache; nothing is saved to the database. On failure the source
   * and code used before are kept.
   * Returns { ok, errorCount, errors, scripts: 1, sources }, sources as
   * this.sources afterwards.
   */
  recompile(sources = null) {
    const source = sources ? String(sources[0] ?? '') : this.source;
    const done = (fields) => ({ scripts: 1, ...fields, sources: this.sources });
    const fail = (errors, errorCount = 1) => done({ ok: false, errorCount, errors });
    if (!this.language?.compileSource) return fail('This program cannot be compiled\n');
    let result;
    try {
      result = this.language.compileSource(source);
    } catch (e) {
      return fail(`Compile failed: ${e?.message ?? e}\n`);
    }
    if (!result.chunk) return fail(result.errors, result.errorCount || 1);
    this.source = source;
    this._recompiled = chunkToJson(result.chunk, { sourceHash: sourceHash(source) });
    return done({ ok: true, errorCount: 0, errors: '' });
  }

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
    this._recompiled = [];   // per program, by index: set by recompile()
    this._sources = [];      // likewise, the sources they were compiled from
  }

  get programs() { return typeof this._programs === 'function' ? this._programs() : this._programs; }

  /** The source each program runs, in order: as given, or as last compiled by recompile(). */
  get sources() { return this.programs.map((p, i) => this._sources[i] ?? String(p.source ?? '')); }

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
    const sources = this.sources;
    this.runners = this.programs.map((p, i) => new ProgramRunner({
      ...p, source: sources[i], compiled: this._recompiled[i] ?? p.compiled, screen: this.screen,
    }));
    for (const runner of this.runners) runner.start();
    return this.processes;
  }

  /** Stops the programs that are running. */
  stop() {
    for (const runner of this.runners) runner.stop();
  }

  /**
   * Compiles the programs' sources afresh, as ProgramRunner.recompile does.
   * Given sources (one per program, as edited), only those that differ from
   * the current ones are compiled; without, every program is. Each that
   * compiles runs its new source and code at later Gos. Returns { ok,
   * errorCount, errors, scripts, sources }: scripts is how many were
   * compiled, errors names each failing script, sources is this.sources
   * afterwards.
   */
  recompile(sources = null) {
    const programs = this.programs;
    const current = this.sources;
    let errorCount = 0;
    let errors = '';
    let scripts = 0;
    programs.forEach((p, i) => {
      if (sources && String(sources[i] ?? '') === current[i]) return;
      scripts += 1;
      const runner = new ProgramRunner({ ...p, source: current[i] });
      const result = runner.recompile(sources ? [sources[i]] : null);
      if (result.ok) {
        this._recompiled[i] = runner.compiled;
        this._sources[i] = runner.source;
      } else {
        errorCount += result.errorCount;
        errors += `${p.name}: ${result.errors}`;
      }
    });
    return { ok: errorCount === 0, errorCount, errors, scripts, sources: this.sources };
  }

  /** Stops the programs, clears the output and removes their widgets. */
  reset() {
    this.stop();
    this.output.text = '';
    this.screen.clearWidgets();
  }
}

/**
 * The toast for a recompile() result: { message, kind }. A failure names the
 * first error.
 */
export function describeCompile({ ok, errorCount, errors, scripts }) {
  if (ok) {
    const what = scripts === 1 ? 'the source' : `${scripts} scripts`;   // 0: nothing had changed
    return { kind: 'success', message: `Compiled ${what}: Go runs the new code` };
  }
  const first = String(errors ?? '').trim().split('\n')[0];
  return { kind: 'error', message: `${errorCount} compile error${errorCount === 1 ? '' : 's'}${first ? `: ${first}` : ''}` };
}

/** ", compiled code" or ", cached" for a StatusBar message; '' when compiled from source. */
export function describeOrigin(origin) {
  if (origin === 'compiled') return ', compiled code';
  if (origin === 'cache') return ', cached';
  return '';
}
