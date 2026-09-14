import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse, compile, run, formatDiagnostics } from '../src/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const read = (file) => readFileSync(join(dir, file), 'utf8');
const files = readdirSync(dir).filter((f) => f.endsWith('.crumb'));

/** broken.crumb fails to load; errors.crumb loads but fails at runtime. */
const RUNNABLE = files.filter((f) => f !== 'broken.crumb' && f !== 'errors.crumb');

test('every example is accounted for', () => {
  assert.ok(files.length >= 5, `expected examples in ${dir}`);
});

for (const file of [...RUNNABLE, 'errors.crumb']) {
  test(`${file} compiles with no load errors`, () => {
    const source = read(file);
    const { chunk, errors } = compile(source, { filename: file });
    assert.equal(errors.length, 0, `\n${formatDiagnostics(errors, source, file)}`);
    assert.ok(chunk.code.length > 0);
  });
}

test('fizzbuzz.crumb prints 20 lines', () => {
  const result = run(read('fizzbuzz.crumb'), { filename: 'fizzbuzz.crumb' });
  assert.equal(result.error, null);
  assert.equal(result.output.length, 20);
  assert.equal(result.output[14], 'FizzBuzz');
});

test('factorial.crumb prints 0! through 9!', () => {
  const result = run(read('factorial.crumb'), { filename: 'factorial.crumb' });
  assert.equal(result.error, null);
  assert.equal(result.output[0], 'Factorial(0) = 1');
  assert.equal(result.output[9], 'Factorial(9) = 362880');
});

test('words.crumb finds the longest word', () => {
  const result = run(read('words.crumb'), { filename: 'words.crumb' });
  assert.equal(result.error, null);
  assert.deepEqual(result.output, ['WORDS: 9', 'LONGEST: quick', 'BACKWARDS: kciuq']);
});

test('errors.crumb fails at the planted line with a full traceback', () => {
  const result = run(read('errors.crumb'), { filename: 'errors.crumb' });
  assert.deepEqual(result.output, ['before']);          // Print ran before the fault
  assert.equal(result.error.line, 9);
  assert.match(result.error.message, /operator \+ expects Number, Number/);
  assert.deepEqual(
    result.error.traceback.map((f) => f.name),
    ['Boom', 'Depth', 'Depth', 'Depth'],
  );
});

test('broken.crumb reports one error per planted mistake', () => {
  const source = read('broken.crumb');
  const { errors } = parse(source, { filename: 'broken.crumb' });
  // 14 deliberate mistakes; the count is asserted so a regression that starts
  // cascading (or stops reporting) shows up here.
  assert.equal(errors.length, 14, `\n${formatDiagnostics(errors, source, 'broken.crumb')}`);
  const linesSeen = new Set(errors.map((e) => e.line));
  assert.ok(linesSeen.size >= 12, 'errors should spread across the file, not pile up');
});
