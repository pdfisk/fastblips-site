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

// ------------------------------------------------------------ loading back

import { readFileSync, readdirSync } from 'node:fs';
import { runChunk } from '../src/index.js';
import {
  chunkFromJson, parseChunkJson, sourceHash, ChunkFormatError, OPCODE_SIGNATURE,
} from '../src/vm/chunk-json.js';

const deterministic = { random: () => 0.25, sleep: () => {}, maxSteps: 5_000_000, fetch: null };
const outputOf = (chunk) => {
  const { output, error } = runChunk(chunk, { ...deterministic, maxDepth: 1000 });
  return { output, error: error ? `${error.line}: ${error.message}` : null };
};

test('every Crumb example runs the same from compiled code as from source', () => {
  for (const file of readdirSync('examples').filter((f) => f.endsWith('.crumb'))) {
    const { chunk } = compile(readFileSync(`examples/${file}`, 'utf8'), { filename: file });
    if (!chunk || file === 'api-tour.crumb' || file === 'button-demo.crumb' || file === 'json-explorer.crumb') continue;   // needs network / a screen
    const loaded = chunkFromJson(chunkToJsonString(chunk));
    assert.deepEqual(loaded.code, chunk.code, file);
    assert.deepEqual(outputOf(loaded), outputOf(chunk), file);
  }
});

test('every MiniPy test program runs the same from compiled code as from source', () => {
  for (const file of readdirSync('test/python').filter((f) => f.endsWith('.py'))) {
    const { chunk } = compilePython(readFileSync(`test/python/${file}`, 'utf8'), { filename: file });
    if (!chunk) continue;
    const loaded = chunkFromJson(JSON.parse(chunkToJsonString(chunk)));
    assert.ok(loaded.runtime && loaded.globalInit, `${file}: runtime rebuilt`);
    assert.equal(loaded.initialSlot, undefined);
    assert.ok('initialSlot' in loaded, `${file}: slots start UNBOUND`);
    assert.deepEqual(outputOf(loaded), outputOf(chunk), file);
  }
});

test('BigInt and non-finite constants survive the round trip', () => {
  const { chunk } = compilePython('print(123456789012345678901234567890 * 2)\n');
  const loaded = chunkFromJson(chunkToJsonString(chunk));
  assert.ok(loaded.constants.includes(123456789012345678901234567890n));
  assert.deepEqual(outputOf(loaded).output, ['246913578024691357802469135780']);
});

test('each load is a fresh chunk: two programs share no runtime', () => {
  const json = chunkToJsonString(compilePython('print(1)\n').chunk);
  const a = chunkFromJson(json);
  const b = chunkFromJson(json);
  assert.notEqual(a.runtime, b.runtime);
  assert.notEqual(a.code, b.code);
});

test('compiled code carries the instruction set and, if given, its source hash', () => {
  const source = 'Print 1\n';
  const json = chunkToJson(compile(source).chunk, { sourceHash: sourceHash(source) });
  assert.equal(json.opcodes, OPCODE_SIGNATURE);
  assert.equal(json.sourceHash, sourceHash(source));
  assert.notEqual(sourceHash('Print 1\n'), sourceHash('Print 2\n'));
});

test('compiled code that cannot be loaded is rejected with a reason', () => {
  const good = chunkToJson(compile('Print 1\n').chunk);
  const bad = (change) => ({ ...good, ...change });
  assert.throws(() => chunkFromJson('{not json'), ChunkFormatError);
  assert.throws(() => chunkFromJson(''), ChunkFormatError);
  assert.throws(() => chunkFromJson(bad({ format: 'other' })), /format/);
  assert.throws(() => chunkFromJson(bad({ version: 99 })), /version/);
  assert.throws(() => chunkFromJson(bad({ opcodes: 'deadbeef' })), /different instruction set/);
  assert.throws(() => chunkFromJson(bad({ language: 'cobol' })), /language/);
  assert.throws(() => chunkFromJson(bad({ lines: [] })), /code or lines/);
  assert.throws(() => chunkFromJson(bad({ constants: [{ $weird: 1 }] })), /unknown constant/);
  assert.equal(parseChunkJson(JSON.stringify(good)).language, 'crumb');
});
