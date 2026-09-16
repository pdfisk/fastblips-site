// Round-robin scheduler: keeps a queue of Processes and gives each one a time
// slice (`quantum` instructions) in turn until every process has finished.

import { Process } from './process.js';

export class Scheduler {
  /** @param {object} options { quantum: instructions per time slice } */
  constructor({ quantum = 100 } = {}) {
    this.quantum = quantum;
    this.processes = new Map();   // pid -> Process
    this.queue = [];              // ready processes, in run order
    this.nextPid = 1;
  }

  /** Creates a process for a compiled chunk and queues it. Returns the Process. */
  spawn(chunk, options = {}) {
    const process = new Process(this.nextPid, chunk, options);
    this.nextPid += 1;
    this.processes.set(process.pid, process);
    this.queue.push(process);
    return process;
  }

  get(pid) { return this.processes.get(pid); }

  kill(pid) {
    const process = this.processes.get(pid);
    if (!process) return false;
    process.kill();
    this.queue = this.queue.filter((p) => p !== process);
    return true;
  }

  get idle() { return this.queue.length === 0; }

  /** Runs one slice of the next ready process. Returns it, or null if idle. */
  tick() {
    const process = this.queue.shift();
    if (!process) return null;
    if (!process.step(this.quantum)) this.queue.push(process);
    return process;
  }

  /** Ticks until no process is ready. */
  runAll() {
    while (!this.idle) this.tick();
  }
}
