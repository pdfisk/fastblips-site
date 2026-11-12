// Breakpoints and single stepping: the VM's debug option (VM.checkDebug),
// and the Scheduler suspending a program that stops (Scheduler.pause).

import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { ProcessState } from '../src/scheduling/process.js';

function chunkOf(source) {
  const result = compile(source);
  assert.ok(result.ok, result.loadErrors.map((e) => e.message).join('\n'));
  return result.chunk;
}

/**
 * Runs source under a debugger, resuming after every stop, and returns the
 * lines it stopped at with what had been printed by then: [[line, out], ...].
 */
function trace(source, debug, { quantum = 10 } = {}) {
  const lines = [];
  const stops = [];
  const scheduler = new Scheduler({ quantum });
  const process = scheduler.spawn(chunkOf(source), {
    out: (text) => lines.push(text),
    debug,
    onPause: (p) => {
      assert.equal(p.state, ProcessState.SUSPENDED);
      stops.push([p.vm.paused.line, lines.join(','), p.vm.paused.reason]);
    },
  });
  for (let guard = 0; guard < 1000 && !process.finished; guard += 1) {
    scheduler.runAll();
    if (!process.finished) assert.ok(scheduler.resume(process.pid));
  }
  assert.equal(process.state, ProcessState.DONE);
  return { stops, lines };
}

const LOOP = 'total = 0\nfor i in range(3):\n    total = total + i\nprint(total)\n';

test('without a debugger a program never pauses', () => {
  const { stops, lines } = trace(LOOP, null);
  assert.deepEqual(stops, []);
  assert.deepEqual(lines, ['3']);
});

test('stepping stops before every line, in the order they run', () => {
  const { stops, lines } = trace(LOOP, { stepping: true });
  assert.deepEqual(stops.map((s) => s[0]), [1, 2, 3, 2, 3, 2, 3, 2, 4]);
  assert.ok(stops.every((s) => s[2] === 'step'));
  assert.equal(stops.at(-1)[1], '', 'stops before the line runs');
  assert.deepEqual(lines, ['3']);
});

test('stepping gives the same stops whatever the time slice', () => {
  const a = trace(LOOP, { stepping: true }, { quantum: 1 });
  const b = trace(LOOP, { stepping: true }, { quantum: 1000 });
  assert.deepEqual(a.stops, b.stops);
});

test('a breakpoint stops each time its line is reached', () => {
  const debug = { breakpoints: new Set([3]), stopAtBreakpoints: true, stepping: false };
  const { stops } = trace(LOOP, debug);
  assert.deepEqual(stops.map((s) => [s[0], s[2]]), [[3, 'breakpoint'], [3, 'breakpoint'], [3, 'breakpoint']]);
});

test('breakpoints are ignored unless stopAtBreakpoints is set', () => {
  const debug = { breakpoints: new Set([3]), stopAtBreakpoints: false, stepping: false };
  assert.deepEqual(trace(LOOP, debug).stops, []);
});

test('stepping goes into a function and comes back to the line after the call', () => {
  const source = 'def twice(n):\n    m = n * 2\n    return m\nx = twice(4)\nprint(x)\n';
  const { stops, lines } = trace(source, { stepping: true });
  assert.deepEqual(stops.map((s) => s[0]), [1, 4, 2, 3, 5]);
  assert.deepEqual(lines, ['8']);
});

test('a function that ends in a loop does not stop again at its implicit return', () => {
  const source = 'def f():\n    for i in range(2):\n        print(i)\nf()\nprint("end")\n';
  const { stops } = trace(source, { stepping: true });
  assert.deepEqual(stops.map((s) => s[0]), [1, 4, 2, 3, 2, 3, 2, 5]);
});

test('the debug settings can change while the program is stopped', () => {
  const debug = { breakpoints: new Set([3]), stopAtBreakpoints: true, stepping: false };
  const stops = [];
  const scheduler = new Scheduler();
  const process = scheduler.spawn(chunkOf(LOOP), {
    out: () => {}, debug, onPause: (p) => stops.push(p.vm.paused.line),
  });
  scheduler.runAll();
  assert.deepEqual(stops, [3]);
  debug.stepping = true;                 // single step from the breakpoint
  scheduler.resume(process.pid);
  scheduler.runAll();
  assert.deepEqual(stops, [3, 2]);
  debug.stepping = false;                // then run on, without breakpoints
  debug.stopAtBreakpoints = false;
  scheduler.resume(process.pid);
  scheduler.runAll();
  assert.equal(process.state, ProcessState.DONE);
  assert.deepEqual(stops, [3, 2]);
});

test('a paused program can be killed', () => {
  const scheduler = new Scheduler();
  const process = scheduler.spawn(chunkOf(LOOP), { out: () => {}, debug: { stepping: true } });
  scheduler.runAll();
  assert.equal(process.state, ProcessState.SUSPENDED);
  scheduler.kill(process.pid);
  assert.equal(process.state, ProcessState.KILLED);
  assert.ok(scheduler.empty);
});
