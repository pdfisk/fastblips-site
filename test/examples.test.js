import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse, compile, run, formatDiagnostics } from '../src/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const read = (file) => readFileSync(join(dir, file), 'utf8');
const files = readdirSync(dir).filter((f) => f.endsWith('.bas'));

/** broken.bas fails to load; errors.bas loads but fails at runtime. */
const RUNNABLE = files.filter((f) => f !== 'broken.bas' && f !== 'errors.bas');

test('every example is accounted for', () => {
  assert.ok(files.length >= 5, `expected examples in ${dir}`);
});

for (const file of [...RUNNABLE, 'errors.bas']) {
  test(`${file} compiles with no load errors`, () => {
    const source = read(file);
    const { chunk, errors } = compile(source, { filename: file });
    assert.equal(errors.length, 0, `\n${formatDiagnostics(errors, source, file)}`);
    assert.ok(chunk.code.length > 0);
  });
}

test('fizzbuzz.bas prints 20 lines', () => {
  const result = run(read('fizzbuzz.bas'), { filename: 'fizzbuzz.bas' });
  assert.equal(result.error, null);
  assert.equal(result.output.length, 20);
  assert.equal(result.output[14], 'FizzBuzz');
});

test('factorial.bas prints 0! through 9!', () => {
  const result = run(read('factorial.bas'), { filename: 'factorial.bas' });
  assert.equal(result.error, null);
  assert.equal(result.output[0], 'Factorial(0) = 1');
  assert.equal(result.output[9], 'Factorial(9) = 362880');
});

test('words.bas finds the longest word', () => {
  const result = run(read('words.bas'), { filename: 'words.bas' });
  assert.equal(result.error, null);
  assert.deepEqual(result.output, ['WORDS: 9', 'LONGEST: quick', 'BACKWARDS: kciuq']);
});

test('errors.bas fails at the planted line with a full traceback', () => {
  const result = run(read('errors.bas'), { filename: 'errors.bas' });
  assert.deepEqual(result.output, ['before']);          // Print ran before the fault
  assert.equal(result.error.line, 9);
  assert.match(result.error.message, /operator \+ expects Number, Number/);
  assert.deepEqual(
    result.error.traceback.map((f) => f.name),
    ['Boom', 'Depth', 'Depth', 'Depth'],
  );
});

test('broken.bas reports one error per planted mistake', () => {
  const source = read('broken.bas');
  const { errors } = parse(source, { filename: 'broken.bas' });
  // 14 deliberate mistakes; the count is asserted so a regression that starts
  // cascading (or stops reporting) shows up here.
  assert.equal(errors.length, 14, `\n${formatDiagnostics(errors, source, 'broken.bas')}`);
  const linesSeen = new Set(errors.map((e) => e.line));
  assert.ok(linesSeen.size >= 12, 'errors should spread across the file, not pile up');
});

// The mobile examples, driven on an in-memory screen.
import { VM } from '../src/index.js';
import { FakeHost } from './fake-widget-host.js';

function startMobileExample(file) {
  const { chunk, errors } = compile(read(file), { filename: file });
  assert.deepEqual(errors.map((e) => e.message), []);
  const host = new FakeHost();
  const output = [];
  const vm = new VM(chunk, { gui: host, out: (line) => output.push(line) });
  const settle = () => { while (!vm.runSlice(10000) && !vm.waiting && !vm.blocked); };
  settle();
  const all = () => [...host.widgets.values()];
  const button = (text) => all().find((w) => w.className === 'Button' && w.props.text === text);
  const click = (text) => { host.click(button(text).id); settle(); };
  const labels = () => all().filter((w) => w.className === 'Label').map((w) => w.props.text);
  return { host, output, all, click, labels, settle };
}

test('mobile-tip.bas steps the bill, tip and people', () => {
  const app = startMobileExample('mobile-tip.bas');
  assert.match(app.labels().join('|'), /Tip \$6\.00 {3}Total \$46\.00 {3}Each \$23\.00/);
  app.click('+ 1%');
  assert.match(app.labels().join('|'), /Tip: 16%/);
  assert.match(app.labels().join('|'), /Tip \$6\.40 {3}Total \$46\.40/);
});

test('mobile-dice.bas rolls and lists the rolls', () => {
  const app = startMobileExample('mobile-dice.bas');
  app.click('Roll');
  app.click('Roll');
  const list = app.all().find((w) => w.className === 'ListPanel');
  assert.equal(list.items.length, 2);
  assert.match(list.items[1], /^#2 /);
  assert.match(app.labels().join('|'), /Total: \d+/);
});

test('mobile-lights-out.bas starts unsolved and counts moves', () => {
  const app = startMobileExample('mobile-lights-out.bas');
  assert.equal(app.output[0], 'Turn every light off. Tap a square.');
  app.host.clickCell(0, 0);
  app.settle();
  assert.equal(app.output.at(-1), 'Moves: 1');
});
