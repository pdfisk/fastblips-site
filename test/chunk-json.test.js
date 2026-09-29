import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { chunkToJson, chunkToJsonString } from '../src/vm/chunk-json.js';

test('a Crumb chunk round-trips through JSON', () => {
  const { chunk } = compile('Sub Hi()\n  Print "hi"\nEnd Sub\nHi()\n', { filename: 'a.crumb' });
  const json = chunkToJson(chunk);
  assert.equal(json.format, 'crumb-chunk');
  assert.deepEqual(json.code, chunk.code);
  assert.deepEqual(json.procedures, chunk.procedures);
  assert.deepEqual(JSON.parse(chunkToJsonString(chunk)), json);
});

test('a MiniPy chunk drops runtime objects and tags BigInt constants', () => {
  const { chunk } = compilePython('def f(a):\n  return a * 2\nprint(f(3))\n', { filename: 'a.py' });
  const json = chunkToJson(chunk);
  assert.equal(json.globalInit, undefined);
  assert.equal(json.runtime, undefined);
  assert.ok(json.constants.some((c) => c && c.$bigint === '2'));
  assert.doesNotThrow(() => chunkToJsonString(chunk));
});
