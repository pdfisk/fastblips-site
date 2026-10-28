import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runChunk } from '../src/index.js';
import { compile as compilePython, formatLoadErrors } from '../src/vm/compiler/python/loader.js';
import { chunkToJsonString, sourceHash } from '../src/vm/chunk-json.js';
import {
  loadProgram, clearCompileCache, compileCacheSize, CACHE_LIMIT,
} from '../src/vm/program-loader.js';

// A compiler like a console's compileSource, counting its calls.
function pythonCompiler() {
  const fn = (source, filename) => {
    fn.calls += 1;
    const { chunk, loadErrors } = compilePython(source, { filename });
    if (!chunk) return { chunk: null, errors: formatLoadErrors(loadErrors, filename).join('\n'), errorCount: loadErrors.length };
    return { chunk, errors: '', errorCount: 0 };
  };
  fn.calls = 0;
  return fn;
}

const compiledFor = (source) => chunkToJsonString(compilePython(source).chunk, { sourceHash: sourceHash(source) });
const outputOf = (chunk) => runChunk(chunk).output;

beforeEach(() => clearCompileCache());

test('compiled code that matches the source is run without compiling', () => {
  const source = 'print("from bytecode")\n';
  const compileFn = pythonCompiler();
  const loaded = loadProgram({ language: 'python', source, compiled: compiledFor(source), compile: compileFn });
  assert.equal(loaded.origin, 'compiled');
  assert.equal(compileFn.calls, 0);
  assert.deepEqual(outputOf(loaded.chunk), ['from bytecode']);
});

test('compiled code for other source is out of date: the source is compiled instead', () => {
  const compileFn = pythonCompiler();
  const loaded = loadProgram({
    language: 'python', source: 'print("new")\n', compiled: compiledFor('print("old")\n'), compile: compileFn,
  });
  assert.equal(loaded.origin, 'source');
  assert.match(loaded.rejected, /out of date/);
  assert.equal(compileFn.calls, 1);
  assert.deepEqual(outputOf(loaded.chunk), ['new']);
});

test('compiled code without a source hash is not trusted when there is source', () => {
  const source = 'print(1)\n';
  const loaded = loadProgram({
    language: 'python', source, compiled: chunkToJsonString(compilePython(source).chunk), compile: pythonCompiler(),
  });
  assert.equal(loaded.origin, 'source');
  assert.match(loaded.rejected, /does not record its source/);
});

test('a program with no source runs from its compiled code alone', () => {
  const compiled = chunkToJsonString(compilePython('print(42)\n').chunk);
  const compileFn = pythonCompiler();
  const loaded = loadProgram({ language: 'python', source: '', compiled, compile: compileFn });
  assert.equal(loaded.origin, 'compiled');
  assert.equal(compileFn.calls, 0);
  assert.deepEqual(outputOf(loaded.chunk), ['42']);
});

test('broken compiled code falls back to the source, or reports an error without one', () => {
  const compileFn = pythonCompiler();
  const withSource = loadProgram({ language: 'python', source: 'print(1)\n', compiled: '{oops', compile: compileFn });
  assert.equal(withSource.origin, 'source');
  assert.match(withSource.rejected, /not valid JSON/);

  const alone = loadProgram({ language: 'python', source: '', compiled: '{oops', compile: compileFn });
  assert.equal(alone.chunk, null);
  assert.equal(alone.errorCount, 1);
  assert.match(alone.errors, /Cannot run the compiled code/);
});

test('compiled code in another language is not used', () => {
  const json = JSON.parse(chunkToJsonString(compilePython('print(1)\n').chunk, { sourceHash: sourceHash('print(1)\n') }));
  json.language = 'crumb';
  const loaded = loadProgram({ language: 'python', source: 'print(1)\n', compiled: json, compile: pythonCompiler() });
  assert.equal(loaded.origin, 'source');
  assert.match(loaded.rejected, /is crumb, not python/);
});

test('running the same source again uses the compile cache', () => {
  const compileFn = pythonCompiler();
  const source = 'for i in range(1, 3):\n    print(i)\n';
  const first = loadProgram({ language: 'python', source, filename: 'a.py', compile: compileFn });
  const second = loadProgram({ language: 'python', source, filename: 'a.py', compile: compileFn });
  assert.equal(first.origin, 'source');
  assert.equal(second.origin, 'cache');
  assert.equal(compileFn.calls, 1);
  assert.notEqual(first.chunk, second.chunk, 'each load is a fresh chunk');
  assert.deepEqual(outputOf(second.chunk), ['1', '2']);

  const edited = loadProgram({ language: 'python', source: `${source}print(3)\n`, filename: 'a.py', compile: compileFn });
  assert.equal(edited.origin, 'source');
  assert.equal(compileFn.calls, 2);
});

test('compiled code given once is cached for the next run of that source', () => {
  const source = 'print("x")\n';
  const compileFn = pythonCompiler();
  loadProgram({ language: 'python', source, compiled: compiledFor(source), compile: compileFn });
  assert.equal(loadProgram({ language: 'python', source, compile: compileFn }).origin, 'cache');
  assert.equal(compileFn.calls, 0);
});

test('MiniPy programs load from compiled code and the cache with a fresh runtime', () => {
  const source = 'class A:\n  pass\nprint(isinstance(A(), A))\n';
  const compileFn = pythonCompiler();
  const compiled = chunkToJsonString(compilePython(source).chunk, { sourceHash: sourceHash(source) });
  const a = loadProgram({ language: 'python', source, compiled, compile: compileFn });
  const b = loadProgram({ language: 'python', source, compile: compileFn });
  assert.equal(a.origin, 'compiled');
  assert.equal(b.origin, 'cache');
  assert.equal(compileFn.calls, 0);
  assert.notEqual(a.chunk.runtime, b.chunk.runtime);
  assert.deepEqual(outputOf(b.chunk), ['True']);
});

test('load errors come back from the compiler, and are not cached', () => {
  const compileFn = pythonCompiler();
  const bad = loadProgram({ language: 'python', source: 'print(1 +\n', compile: compileFn });
  assert.equal(bad.chunk, null);
  assert.equal(bad.errorCount, 1);
  assert.match(bad.errors, /error/);
  loadProgram({ language: 'python', source: 'print(1 +\n', compile: compileFn });
  assert.equal(compileFn.calls, 2);
  assert.equal(compileCacheSize(), 0);
});

test('the cache keeps at most CACHE_LIMIT programs', () => {
  const compileFn = pythonCompiler();
  for (let i = 0; i < CACHE_LIMIT + 5; i++) loadProgram({ language: 'python', source: `print(${i})\n`, compile: compileFn });
  assert.equal(compileCacheSize(), CACHE_LIMIT);
  assert.equal(loadProgram({ language: 'python', source: 'print(0)\n', compile: compileFn }).origin, 'source', 'oldest evicted');
});
