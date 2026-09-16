// A Process is one running Crumb program: a VM plus the bookkeeping the
// Scheduler needs (id, name, state, exit result).
//
// The VM does the work; the Process only tracks where it is in its life:
//   [scheduled ->] ready -> running -> ready | sleeping ... -> done | failed | killed
//
// A process that calls Sleep goes to `sleeping`; the Scheduler wakes it later.
// Any waiting or ready process can be `suspended`, and later resumed.

import { VM } from '../vm/vm.js';

export const ProcessState = Object.freeze({
  SCHEDULED: 'scheduled',
  READY: 'ready',
  RUNNING: 'running',
  SLEEPING: 'sleeping',
  SUSPENDED: 'suspended',
  DONE: 'done',
  FAILED: 'failed',
  KILLED: 'killed',
});

const FINISHED = new Set([ProcessState.DONE, ProcessState.FAILED, ProcessState.KILLED]);

export class Process {
  /**
   * @param {number} pid     id assigned by the Scheduler
   * @param {object} chunk   compiled bytecode (see vm/compiler.js)
   * @param {object} options { name, onExit, ...VM options }
   *   onExit(process) is called once, when the process finishes for any reason.
   */
  constructor(pid, chunk, { name = `process-${pid}`, onExit = null, ...vmOptions } = {}) {
    this.pid = pid;
    this.name = name;
    this.vm = new VM(chunk, vmOptions);
    this.state = ProcessState.READY;
    this.error = null;
    this.slices = 0;
    this.startAt = null;          // ms timestamp it next becomes ready; set by the Scheduler
    this.sleepMs = null;          // pending Sleep, read by the Scheduler
    this.onExit = onExit;
  }

  get finished() { return FINISHED.has(this.state); }

  /**
   * Runs the process for one time slice of at most `quantum` instructions.
   * Returns true once the process has finished. Runtime errors are captured
   * on the process, not rethrown.
   */
  step(quantum) {
    if (this.finished) return true;
    this.state = ProcessState.RUNNING;
    this.slices += 1;
    try {
      const halted = this.vm.runSlice(quantum);
      this.sleepMs = halted ? null : this.vm.takeSleep();
      if (halted) this.finish(ProcessState.DONE);
      else this.state = this.sleepMs !== null ? ProcessState.SLEEPING : ProcessState.READY;
    } catch (error) {
      this.error = error;
      this.finish(ProcessState.FAILED);
    }
    return this.finished;
  }

  /** Returns and clears a pending Sleep (milliseconds), or null. */
  takeSleep() {
    const ms = this.sleepMs;
    this.sleepMs = null;
    return ms;
  }

  kill() {
    if (!this.finished) this.finish(ProcessState.KILLED);
  }

  finish(state) {
    this.state = state;
    this.onExit?.(this);
  }
}
