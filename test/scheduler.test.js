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
