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
