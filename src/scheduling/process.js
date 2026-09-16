// A Process is one running Crumb program: a VM plus the bookkeeping the
// Scheduler needs (id, name, state, exit result).
//
// The VM does the work; the Process only tracks where it is in its life:
//   ready -> running -> ready ... -> done | failed | killed

import { VM } from '../vm/vm.js';

export const ProcessState = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  KILLED: 'killed',
});

const FINISHED = new Set([ProcessState.DONE, ProcessState.FAILED, ProcessState.KILLED]);

export class Process {
  /**
   * @param {number} pid     id assigned by the Scheduler
   * @param {object} chunk   compiled bytecode (see vm/compiler.js)
   * @param {object} options { name, ...VM options }
   */
  constructor(pid, chunk, { name = `process-${pid}`, ...vmOptions } = {}) {
    this.pid = pid;
    this.name = name;
    this.vm = new VM(chunk, vmOptions);
    this.state = ProcessState.READY;
    this.error = null;
    this.slices = 0;
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
      this.state = halted ? ProcessState.DONE : ProcessState.READY;
    } catch (error) {
      this.error = error;
      this.state = ProcessState.FAILED;
    }
    return this.finished;
  }

  kill() {
    if (!this.finished) this.state = ProcessState.KILLED;
  }
}
