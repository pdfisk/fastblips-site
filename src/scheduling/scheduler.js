// Round-robin scheduler with delayed starts.
//
// Two queues:
//   activeQueue    - ready processes, in run order. Each gets a time slice
//                    (`quantum` instructions) in turn.
//   scheduledQueue - processes waiting to start, sorted by startAt (earliest
//                    first). A process moves to activeQueue once its start
//                    time has arrived.

import { Process, ProcessState } from './process.js';

export class Scheduler {
  /**
   * @param {object} options
   *   quantum: instructions per time slice
   *   now:     clock returning milliseconds (injectable for tests)
   */
  constructor({ quantum = 100, now = () => Date.now() } = {}) {
    this.quantum = quantum;
    this.now = now;
    this.processes = new Map();   // pid -> Process
    this.activeQueue = [];        // ready processes, in run order
    this.scheduledQueue = [];     // waiting processes, sorted by startAt
    this.nextPid = 1;
  }

  /**
   * Creates a process for a compiled chunk and schedules it. Returns the Process.
   * options.delay: milliseconds to wait before the process starts (default 0).
   * Other options are passed to the Process / VM.
   */
  spawn(chunk, { delay = 0, ...options } = {}) {
    const process = new Process(this.nextPid, chunk, options);
    this.scheduleProcess(process, delay);
    return process;
  }

  /** Registers a process and queues it to start after `delay` milliseconds. */
  scheduleProcess(process, delay = 0) {
    this.nextPid = Math.max(this.nextPid, process.pid + 1);
    this.processes.set(process.pid, process);

    if (delay <= 0) {
      process.startAt = this.now();
      this.activeQueue.push(process);
      return;
    }

    process.startAt = this.now() + delay;
    process.state = ProcessState.SCHEDULED;
    // Insert after every process with startAt <= this one, so equal start
    // times keep their spawn order.
    const index = this.scheduledQueue.findIndex((p) => p.startAt > process.startAt);
    if (index === -1) this.scheduledQueue.push(process);
    else this.scheduledQueue.splice(index, 0, process);
  }

  get(pid) { return this.processes.get(pid); }

  kill(pid) {
    const process = this.processes.get(pid);
    if (!process) return false;
    process.kill();
    this.activeQueue = this.activeQueue.filter((p) => p !== process);
    this.scheduledQueue = this.scheduledQueue.filter((p) => p !== process);
    return true;
  }

  /** Moves every scheduled process whose start time has arrived to activeQueue. */
  promoteDue() {
    const now = this.now();
    while (this.scheduledQueue.length > 0 && this.scheduledQueue[0].startAt <= now) {
      const process = this.scheduledQueue.shift();
      process.state = ProcessState.READY;
      this.activeQueue.push(process);
    }
  }

  /** True when nothing is ready to run right now (scheduled processes may still be waiting). */
  get idle() {
    this.promoteDue();
    return this.activeQueue.length === 0;
  }

  /** True when no process is ready or waiting. */
  get empty() {
    return this.activeQueue.length === 0 && this.scheduledQueue.length === 0;
  }

  /** Start time of the next scheduled process, or null if none is waiting. */
  get nextStartAt() {
    return this.scheduledQueue[0]?.startAt ?? null;
  }

  /** Runs one slice of the next ready process. Returns it, or null if idle. */
  tick() {
    this.promoteDue();
    const process = this.activeQueue.shift();
    if (!process) return null;
    if (!process.step(this.quantum)) this.activeQueue.push(process);
    return process;
  }

  /** Ticks until no process is ready. Scheduled processes that are not yet due are left waiting. */
  runAll() {
    while (!this.idle) this.tick();
  }

  /**
   * Runs until every process, including scheduled ones, has finished,
   * sleeping while nothing is ready.
   * @param {(ms: number) => Promise<void>} sleep  injectable for tests
   */
  async runToCompletion(sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    while (!this.empty) {
      this.runAll();
      if (this.scheduledQueue.length > 0) {
        await sleep(Math.max(0, this.nextStartAt - this.now()));
      }
    }
  }
}
