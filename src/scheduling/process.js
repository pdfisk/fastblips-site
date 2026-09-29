// A Process is one running program, Crumb or MiniPy: a VM plus the bookkeeping the
// Scheduler needs (id, name, state, exit result).
//
// The VM does the work; the Process only tracks where it is in its life:
//   [scheduled ->] ready -> running -> ready | sleeping | waiting ... -> done | failed | killed
//
// A process that calls Sleep goes to `sleeping`; the Scheduler wakes it later.
// One that has registered event handlers and finished its module code goes
// to `waiting` until an event arrives (the VM calls its onWake), and so does
// one waiting for a Fetch, until the response arrives.
// Any waiting or ready process can be `suspended`, and later resumed.

import { VM } from '../vm/vm.js';

export const ProcessState = Object.freeze({
  SCHEDULED: 'scheduled',
  READY: 'ready',
  RUNNING: 'running',
  SLEEPING: 'sleeping',
  WAITING: 'waiting',   // for an event (a widget click; see VM.listen) or a Fetch (VM.block)
  SUSPENDED: 'suspended',
  DONE: 'done',
  FAILED: 'failed',
  KILLED: 'killed',
});

/** Priorities run from 1 (highest) to 5 (lowest); a process gets 3 unless told otherwise. */
export const HIGHEST_PRIORITY = 1;
export const LOWEST_PRIORITY = 5;
export const DEFAULT_PRIORITY = 3;

/**
 * Checks a priority: a whole number from 1 to 5 (a numeric string such as a
 * form value is accepted). null or undefined gives DEFAULT_PRIORITY. Throws a
 * RangeError for anything else.
 */
export function normalizePriority(priority) {
  if (priority === null || priority === undefined) return DEFAULT_PRIORITY;
  const n = typeof priority === 'string' && priority.trim() !== '' ? Number(priority) : priority;
  if (!Number.isInteger(n) || n < HIGHEST_PRIORITY || n > LOWEST_PRIORITY) {
    throw new RangeError(`priority must be a whole number from ${HIGHEST_PRIORITY} (highest) to ${LOWEST_PRIORITY} (lowest), got ${String(priority)}`);
  }
  return n;
}

const FINISHED = new Set([ProcessState.DONE, ProcessState.FAILED, ProcessState.KILLED]);

export class Process {
  /**
   * @param {number} pid     id assigned by the Scheduler
   * @param {object} chunk   compiled bytecode from either compiler (see src/vm/opcodes.js)
   * @param {object} options { name, priority, onExit, ...VM options }
   *   priority: 1 (highest) to 5 (lowest), default 3; see Scheduler.
   *   onExit(process) is called once, when the process finishes for any reason.
   */
  constructor(pid, chunk, {
    name = `process-${pid}`, priority = DEFAULT_PRIORITY, onExit = null, ...vmOptions
  } = {}) {
    this.pid = pid;
    this.name = name;
    this.priority = normalizePriority(priority);
    this.readySince = 0;          // the Scheduler's turn count when it last became ready
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
      else if (this.sleepMs !== null) this.state = ProcessState.SLEEPING;
      else this.state = this.vm.waiting || this.vm.blocked ? ProcessState.WAITING : ProcessState.READY;
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
