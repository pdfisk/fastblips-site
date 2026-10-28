// examples/*.py: every example loads without errors. (The Basic examples were
// archived with the Basic compiler: see archive/crumb-basic-2026-10-27.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile, formatLoadErrors } from '../src/vm/compiler/python/loader.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const files = readdirSync(dir).filter((f) => f.endsWith('.py'));

test('every example is accounted for', () => {
  assert.ok(files.length >= 5, `expected examples in ${dir}`);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.bas')), [], 'Basic examples were archived');
});

for (const file of files) {
  test(`${file} compiles with no load errors`, () => {
    const { chunk, loadErrors } = compile(readFileSync(join(dir, file), 'utf8'), { filename: file });
    assert.equal(loadErrors.length, 0, `\n${formatLoadErrors(loadErrors, file).join('\n')}`);
    assert.ok(chunk.code.length > 0);
  });
}
