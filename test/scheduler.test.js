import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { ProcessState } from '../src/scheduling/process.js';

function chunkOf(source) {
  const result = compile(source);
  assert.ok(result.ok, result.errors.map((e) => e.message).join('\n'));
  return result.chunk;
}

const counter = (label) => chunkOf(`For i = 1 To 3\n  Print "${label}" & i\nNext`);

test('programs take turns and interleave their output', () => {
  const lines = [];
  const out = (text) => lines.push(text);
  const scheduler = new Scheduler({ quantum: 5 });
  const a = scheduler.spawn(counter('a'), { out });
  const b = scheduler.spawn(counter('b'), { out });
  scheduler.runAll();

  assert.equal(a.state, ProcessState.DONE);
  assert.equal(b.state, ProcessState.DONE);
  assert.ok(a.slices > 1 && b.slices > 1, 'each program should need several slices');
  assert.deepEqual(lines.filter((l) => l.startsWith('a')), ['a1', 'a2', 'a3']);
  assert.deepEqual(lines.filter((l) => l.startsWith('b')), ['b1', 'b2', 'b3']);
  assert.notDeepEqual(lines, ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], 'output should interleave');
});

test('a resumed VM gives the same output as an uninterrupted one', () => {
  const source = 'Function F(n)\n  If n <= 1 Then Return 1\n  Return n * F(n - 1)\nEnd Function\nFor i = 0 To 6\n  Print F(i)\nNext';
  const whole = [];
  const sliced = [];
  new Scheduler({ quantum: Infinity }).spawn(chunkOf(source), { out: (t) => whole.push(t) }).step(Infinity);
  const s = new Scheduler({ quantum: 1 });
  s.spawn(chunkOf(source), { out: (t) => sliced.push(t) });
  s.runAll();
  assert.deepEqual(sliced, whole);
});

test('a failing process does not stop the others', () => {
  const lines = [];
  const scheduler = new Scheduler({ quantum: 2 });
  const bad = scheduler.spawn(chunkOf('Print 1 + "x"'), { out: () => {} });
  const good = scheduler.spawn(counter('g'), { out: (t) => lines.push(t) });
  scheduler.runAll();
  assert.equal(bad.state, ProcessState.FAILED);
  assert.ok(bad.error);
  assert.equal(good.state, ProcessState.DONE);
  assert.deepEqual(lines, ['g1', 'g2', 'g3']);
});

test('kill removes a process from the queue', () => {
  const scheduler = new Scheduler({ quantum: 1 });
  const p = scheduler.spawn(counter('k'), { out: () => {} });
  scheduler.tick();
  scheduler.kill(p.pid);
  assert.equal(p.state, ProcessState.KILLED);
  assert.ok(scheduler.idle);
});

test('delayed processes wait in scheduledQueue, sorted by start time', () => {
  let clock = 1000;
  const lines = [];
  const out = (text) => lines.push(text);
  const scheduler = new Scheduler({ quantum: 5, now: () => clock });
  const late = scheduler.spawn(counter('late'), { out, delay: 200 });
  const soon = scheduler.spawn(counter('soon'), { out, delay: 100 });
  const now = scheduler.spawn(counter('now'), { out });

  assert.deepEqual(scheduler.activeQueue, [now]);
  assert.deepEqual(scheduler.scheduledQueue, [soon, late]);
  assert.equal(soon.state, ProcessState.SCHEDULED);
  assert.equal(scheduler.nextStartAt, 1100);

  scheduler.runAll();
  assert.deepEqual(lines, ['now1', 'now2', 'now3']);
  assert.equal(late.state, ProcessState.SCHEDULED);

  clock = 1100;
  scheduler.runAll();
  assert.equal(soon.state, ProcessState.DONE);
  assert.deepEqual(scheduler.scheduledQueue, [late]);

  clock = 1200;
  scheduler.runAll();
  assert.equal(late.state, ProcessState.DONE);
  assert.ok(scheduler.empty);
});

test('runToCompletion sleeps until scheduled processes are due', async () => {
  let clock = 0;
  const sleeps = [];
  const scheduler = new Scheduler({ now: () => clock });
  const p = scheduler.spawn(counter('d'), { out: () => {}, delay: 50 });
  await scheduler.runToCompletion(async (ms) => { sleeps.push(ms); clock += ms; });
  assert.deepEqual(sleeps, [50]);
  assert.equal(p.state, ProcessState.DONE);
});

test('kill removes a scheduled process', () => {
  const scheduler = new Scheduler({ now: () => 0 });
  const p = scheduler.spawn(counter('x'), { out: () => {}, delay: 10 });
  scheduler.kill(p.pid);
  assert.equal(p.state, ProcessState.KILLED);
  assert.ok(scheduler.empty);
});

test('a sleeping process waits in scheduledQueue while others run', () => {
  let clock = 0;
  const lines = [];
  const out = (text) => lines.push(text);
  const scheduler = new Scheduler({ quantum: 1000, now: () => clock });
  const sleeper = scheduler.spawn(chunkOf('Print "s1"\nSleep(1)\nPrint "s2"'), { out });
  const other = scheduler.spawn(counter('o'), { out });

  scheduler.runAll();
  assert.deepEqual(lines, ['s1', 'o1', 'o2', 'o3']);
  assert.equal(sleeper.state, ProcessState.SLEEPING);
  assert.equal(sleeper.startAt, 1000);
  assert.deepEqual(scheduler.scheduledQueue, [sleeper]);
  assert.equal(other.state, ProcessState.DONE);

  clock = 999;
  scheduler.runAll();
  assert.equal(sleeper.state, ProcessState.SLEEPING);

  clock = 1000;
  scheduler.runAll();
  assert.deepEqual(lines, ['s1', 'o1', 'o2', 'o3', 's2']);
  assert.equal(sleeper.state, ProcessState.DONE);
});

test('start() runs in the background, sleeping until processes wake', async () => {
  let clock = 0;
  const waits = [];
  const exits = [];
  const scheduler = new Scheduler({ now: () => clock });
  scheduler.spawn(chunkOf('Sleep(0.25)\nSleep(3)'), { out: () => {}, onExit: (p) => exits.push(p.state) });
  const sleep = async (ms) => { waits.push(ms); clock += ms; };
  const first = scheduler.start({ sleep });
  assert.equal(scheduler.start({ sleep }), first, 'a second start() joins the running one');
  await first;
  assert.deepEqual(waits, [0.25, 3000, 0]);
  assert.deepEqual(exits, [ProcessState.DONE]);
  assert.equal(scheduler.running, null);
});

test('onExit fires once for failed and killed processes', () => {
  const exits = [];
  const onExit = (p) => exits.push(`${p.name}:${p.state}`);
  const scheduler = new Scheduler({ now: () => 0 });
  scheduler.spawn(chunkOf('Print 1 + "x"'), { name: 'bad', out: () => {}, onExit });
  const k = scheduler.spawn(chunkOf('Sleep(5)'), { name: 'k', out: () => {}, onExit });
  scheduler.runAll();
  scheduler.kill(k.pid);
  scheduler.kill(k.pid);
  assert.deepEqual(exits, ['bad:failed', 'k:killed']);
});

test('suspend takes a process out of turn; resume puts it back', () => {
  const lines = [];
  const out = (text) => lines.push(text);
  const scheduler = new Scheduler({ quantum: 1, now: () => 0 });
  const a = scheduler.spawn(counter('a'), { out });
  const b = scheduler.spawn(counter('b'), { out });

  assert.ok(scheduler.suspend(a.pid));
  assert.equal(scheduler.suspend(a.pid), false, 'already suspended');
  assert.equal(a.state, ProcessState.SUSPENDED);
  scheduler.runAll();
  assert.deepEqual(lines, ['b1', 'b2', 'b3']);
  assert.ok(scheduler.empty, 'a suspended process does not keep the scheduler busy');
  assert.deepEqual(scheduler.list(), [a]);

  assert.ok(scheduler.resume(a.pid));
  assert.equal(scheduler.resume(a.pid), false, 'not suspended any more');
  scheduler.runAll();
  assert.deepEqual(lines, ['b1', 'b2', 'b3', 'a1', 'a2', 'a3']);
  assert.equal(a.state, ProcessState.DONE);
  assert.equal(b.state, ProcessState.DONE);
  assert.deepEqual(scheduler.list(), []);
});

test('a suspended sleeper keeps the rest of its sleep', () => {
  let clock = 0;
  const scheduler = new Scheduler({ now: () => clock });
  const p = scheduler.spawn(chunkOf('Sleep(1)\nPrint "woke"'), { out: () => {} });
  scheduler.runAll();                    // now sleeping until 1000
  clock = 400;
  scheduler.suspend(p.pid);
  clock = 5000;                          // time passes while suspended
  scheduler.resume(p.pid);
  assert.equal(p.state, ProcessState.SLEEPING);
  assert.equal(p.startAt, 5600);         // the remaining 600 ms
  clock = 5600;
  scheduler.runAll();
  assert.equal(p.state, ProcessState.DONE);
});

test('a suspended process can be killed', () => {
  const scheduler = new Scheduler({ now: () => 0 });
  const p = scheduler.spawn(counter('x'), { out: () => {} });
  scheduler.suspend(p.pid);
  scheduler.kill(p.pid);
  assert.equal(p.state, ProcessState.KILLED);
  assert.equal(scheduler.resume(p.pid), false);
  assert.deepEqual(scheduler.list(), []);
});

test('start() while sleeping wakes the loop for a new process', async () => {
  const lines = [];
  const scheduler = new Scheduler();
  const long = scheduler.spawn(chunkOf('Sleep(60)'), { out: () => {} });
  const done = scheduler.start();
  await new Promise((r) => setTimeout(r, 20));        // the loop is now sleeping ~60 s
  const t0 = Date.now();
  const quick = scheduler.spawn(chunkOf('Print "hi"'), { out: (t) => lines.push(t) });
  assert.equal(scheduler.start(), done);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(lines, ['hi']);
  assert.equal(quick.state, ProcessState.DONE);
  assert.ok(Date.now() - t0 < 1000);
  scheduler.kill(long.pid);
  scheduler.start();                                    // wake so the loop sees it is empty
  await done;
});
