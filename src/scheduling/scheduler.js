// Round-robin scheduler with delayed starts.
//
// Two queues:
//   activeQueue    - ready processes, in run order. Each gets a time slice
//                    (`quantum` instructions) in turn.
//   scheduledQueue - processes waiting to start or to wake from Sleep, sorted
//                    by startAt (earliest first). A process moves to
//                    activeQueue once that time has arrived.

import { Process, ProcessState } from './process.js';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    this.running = null;          // promise while start() is driving
    this.wake = null;             // cuts start()'s current sleep short
    this.suspended = new Map();   // pid -> { state, remaining } to restore on resume
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

  /**
   * Registers a process and queues it to run after `delay` milliseconds.
   * `state` is what the process shows while it waits: SCHEDULED for a
   * delayed start, SLEEPING for a Sleep.
   */
  scheduleProcess(process, delay = 0, state = ProcessState.SCHEDULED) {
    this.nextPid = Math.max(this.nextPid, process.pid + 1);
    this.processes.set(process.pid, process);

    if (delay <= 0) {
      process.startAt = this.now();
      process.state = ProcessState.READY;
      this.activeQueue.push(process);
      return;
    }

    process.startAt = this.now() + delay;
    process.state = state;
    // Insert after every process with startAt <= this one, so equal start
    // times keep their spawn order.
    const index = this.scheduledQueue.findIndex((p) => p.startAt > process.startAt);
    if (index === -1) this.scheduledQueue.push(process);
    else this.scheduledQueue.splice(index, 0, process);
  }

  get(pid) { return this.processes.get(pid); }

  /** Every process that has not finished (ready, waiting or suspended), by pid. */
  list() {
    return [...this.processes.values()].filter((p) => !p.finished);
  }

  kill(pid) {
    const process = this.processes.get(pid);
    if (!process) return false;
    process.kill();
    this.unqueue(process);
    this.suspended.delete(pid);
    return true;
  }

  /**
   * Takes a process out of the queues so it gets no more turns until resumed.
   * A delayed or sleeping process keeps the rest of its wait for later.
   * Returns false if the process is unknown, finished or already suspended.
   */
  suspend(pid) {
    const process = this.processes.get(pid);
    if (!process || process.finished || this.suspended.has(pid)) return false;
    const waiting = this.scheduledQueue.includes(process);
    this.suspended.set(pid, {
      state: process.state,
      remaining: waiting ? Math.max(0, process.startAt - this.now()) : 0,
    });
    this.unqueue(process);
    process.state = ProcessState.SUSPENDED;
    return true;
  }

  /**
   * Puts a suspended process back: ready at once, or waiting out whatever
   * remained of its delay or Sleep. Call start() again if the scheduler is
   * running in the background and had gone quiet.
   */
  resume(pid) {
    const saved = this.suspended.get(pid);
    const process = this.processes.get(pid);
    if (!saved || !process) return false;
    this.suspended.delete(pid);
    this.scheduleProcess(process, saved.remaining, saved.state);
    return true;
  }

  unqueue(process) {
    this.activeQueue = this.activeQueue.filter((p) => p !== process);
    this.scheduledQueue = this.scheduledQueue.filter((p) => p !== process);
  }

  /** Moves every waiting process whose time has arrived to activeQueue. */
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

  /** True when no process is ready or waiting (suspended ones do not count). */
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
    if (process.step(this.quantum)) return process;
    const sleepMs = process.takeSleep();
    if (sleepMs !== null) this.scheduleProcess(process, sleepMs, ProcessState.SLEEPING);
    else this.activeQueue.push(process);
    return process;
  }

  /** Ticks until no process is ready. Waiting processes that are not yet due are left waiting. */
  runAll() {
    while (!this.idle) this.tick();
  }

  /**
   * Runs until every process, including scheduled ones, has finished,
   * sleeping while nothing is ready.
   * @param {(ms: number) => Promise<void>} sleep  injectable for tests
   */
  async runToCompletion(sleep = defaultSleep) {
    while (!this.empty) {
      this.runAll();
      if (this.scheduledQueue.length > 0) {
        await sleep(Math.max(0, this.nextStartAt - this.now()));
      }
    }
  }

  /**
   * Runs in the background without freezing the page: ticks for at most
   * `sliceMs` of wall-clock time, then yields to the event loop, and sleeps
   * while every process is waiting. Returns a promise that settles when both
   * queues are empty. Calling it while it is already running wakes the loop
   * (so a newly spawned or resumed process runs at once) and returns the same
   * promise, so processes can be spawned at any time and then start()ed.
   */
  start({ sliceMs = 16, sleep = defaultSleep } = {}) {
    if (this.running) {
      this.wake?.();
      return this.running;
    }
    const loop = async () => {
      try {
        while (!this.empty) {
          const deadline = this.now() + sliceMs;
          while (!this.idle && this.now() < deadline) this.tick();
          const wait = this.idle ? Math.max(0, this.nextStartAt - this.now()) : 0;
          const woken = new Promise((resolve) => { this.wake = resolve; });
          await Promise.race([sleep(wait), woken]);
          this.wake = null;
        }
      } finally {
        this.running = null;
        this.wake = null;
      }
    };
    this.running = loop();
    return this.running;
  }
}
