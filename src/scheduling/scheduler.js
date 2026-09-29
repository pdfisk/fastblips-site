// Priority scheduler with delayed starts.
//
// Two queues:
//   activeQueue    - ready processes, in the order they became ready. Each
//                    turn goes to one of them for a time slice (`quantum`
//                    instructions).
//   scheduledQueue - processes waiting to start or to wake from Sleep, sorted
//                    by startAt (earliest first). A process moves to
//                    activeQueue once that time has arrived.
//
// Priorities: every process has a priority from 1 (highest) to 5 (lowest),
// 3 by default. Each turn goes to the ready process with the highest
// priority; processes of equal priority take turns round robin. So that a
// busy high-priority program cannot starve the others completely, a ready
// process that keeps being passed over is aged: for every `aging` turns it
// has waited it counts as one level higher, until it gets a turn and drops
// back to its own priority. aging: Infinity makes priorities strict.

import {
  Process, ProcessState, normalizePriority, DEFAULT_PRIORITY,
} from './process.js';

/** Instructions per time slice unless the Scheduler is given a quantum. */
export const DEFAULT_QUANTUM = 10;

/** Turns a ready process waits before it counts as one priority level higher. */
export const DEFAULT_AGING = 20;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Scheduler {
  /**
   * @param {object} options
   *   quantum: instructions per time slice (default 10)
   *   aging:   turns a ready process may be passed over before it counts as
   *            one priority level higher (default 20; Infinity: never)
   *   now:     clock returning milliseconds (injectable for tests)
   */
  constructor({ quantum = DEFAULT_QUANTUM, aging = DEFAULT_AGING, now = () => Date.now() } = {}) {
    if (!(aging > 0)) throw new RangeError(`aging must be more than 0, got ${aging}`);
    this.quantum = quantum;
    this.aging = aging;
    this.now = now;
    this.turns = 0;               // turns given so far; ages the ready processes
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
   * options.priority: 1 (highest) to 5 (lowest), default 3.
   * Other options are passed to the Process / VM.
   */
  spawn(chunk, { delay = 0, ...options } = {}) {
    const process = new Process(this.nextPid, chunk, options);
    process.vm.onWake = () => this.notify(process.pid);
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
      this.makeReady(process);
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

  /** Puts a process at the back of activeQueue, ready for a turn. */
  makeReady(process) {
    process.state = ProcessState.READY;
    process.readySince = this.turns;
    this.activeQueue.push(process);
  }

  get(pid) { return this.processes.get(pid); }

  /**
   * Changes a process's priority: 1 (highest) to 5 (lowest). It takes effect
   * from the next turn. Returns false if the process is unknown or finished;
   * throws a RangeError for a priority out of range.
   */
  setPriority(pid, priority) {
    const level = normalizePriority(priority);
    const process = this.processes.get(pid);
    if (!process || process.finished) return false;
    process.priority = level;
    return true;
  }

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

  /**
   * An event arrived for a process waiting for one: queue it to run, and make
   * sure the background loop (start()) is running. A suspended process picks
   * its events up when resumed.
   */
  notify(pid) {
    const process = this.processes.get(pid);
    if (!process || process.state !== ProcessState.WAITING) return false;
    this.scheduleProcess(process, 0);
    this.start();
    return true;
  }

  unqueue(process) {
    this.activeQueue = this.activeQueue.filter((p) => p !== process);
    this.scheduledQueue = this.scheduledQueue.filter((p) => p !== process);
  }

  /** Moves every waiting process whose time has arrived to activeQueue. */
  promoteDue() {
    if (this.scheduledQueue.length === 0) return;
    const now = this.now();
    while (this.scheduledQueue.length > 0 && this.scheduledQueue[0].startAt <= now) {
      this.makeReady(this.scheduledQueue.shift());
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

  /**
   * Takes the process whose turn it is out of activeQueue: the one with the
   * best priority after ageing (the lowest number), the earliest to become
   * ready among equals. Returns undefined if none is ready.
   */
  takeNext() {
    const queue = this.activeQueue;
    if (queue.length <= 1) return queue.shift();
    let best = 0;
    let bestLevel = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      const level = (p.priority ?? DEFAULT_PRIORITY) - Math.floor((this.turns - p.readySince) / this.aging);
      if (level < bestLevel) { best = i; bestLevel = level; }
    }
    return best === 0 ? queue.shift() : queue.splice(best, 1)[0];
  }

  /** Runs one slice of the next ready process. Returns it, or null if idle. */
  tick() {
    this.promoteDue();
    const process = this.takeNext();
    if (!process) return null;
    this.turns += 1;
    if (process.step(this.quantum)) return process;
    const sleepMs = process.takeSleep();
    if (sleepMs !== null) this.scheduleProcess(process, sleepMs, ProcessState.SLEEPING);
    else if (process.state === ProcessState.WAITING) { /* off the queues until notify() */ }
    else this.makeReady(process);
    return process;
  }

  /** Ticks until no process is ready. Waiting processes that are not yet due are left waiting. */
  runAll() {
    while (!this.idle) this.tick();
  }

  /**
   * Runs until every process, including scheduled ones and ones waiting for
   * a Fetch, has finished, sleeping while nothing is ready. (Processes
   * waiting for clicks are left waiting.)
   * @param {(ms: number) => Promise<void>} sleep  injectable for tests
   */
  async runToCompletion(sleep = defaultSleep) {
    for (;;) {
      this.runAll();
      const fetching = this.fetching;
      if (this.empty && fetching.length === 0) return;
      const waits = fetching.map((p) => p.vm.blockedOn);
      if (this.scheduledQueue.length > 0) waits.push(sleep(Math.max(0, this.nextStartAt - this.now())));
      await Promise.race(waits);
    }
  }

  /** Processes waiting for a Fetch (not counting suspended ones). */
  get fetching() {
    return [...this.processes.values()].filter((p) => p.state === ProcessState.WAITING && p.vm.blocked);
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
          // Reading the clock costs about as much as a short turn, so with a
          // small quantum it is read every few turns (about every 1000
          // instructions), not after each one.
          const turnsPerCheck = Math.max(1, Math.floor(1000 / this.quantum));
          let turns = 0;
          while (!this.idle) {
            this.tick();
            if (++turns % turnsPerCheck === 0 && this.now() >= deadline) break;
          }
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
