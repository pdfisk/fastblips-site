// src/ui/program-runner.js: recompile() (a launch window's Compile button)
// compiles the source afresh, and later runs use the new code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgramRunner, ProgramSetRunner, describeCompile } from '../src/ui/program-runner.js';
import { compile as compilePython, formatLoadErrors } from '../src/vm/compiler/python/loader.js';
import { sourceHash } from '../src/vm/chunk-json.js';

// A language that compiles with the real BlipPy compiler and records what
// each spawn was given, without making a process (which needs a page).
function language() {
  const spawned = [];
  return {
    spawned,
    compileSource(source) {
      const { chunk, loadErrors } = compilePython(source, { filename: 'console.py' });
      return chunk ? { chunk, errors: '', errorCount: 0 }
        : { chunk: null, errors: `${formatLoadErrors(loadErrors, 'console.py').join('\n')}\n`, errorCount: loadErrors.length };
    },
    spawn(source, options) {
      spawned.push({ source, compiled: options.compiled });
      return { process: null, errorCount: 0 };
    },
  };
}
const screen = () => ({ textPanel: { text: '' }, clearWidgets() {}, host: {} });

test('ProgramRunner.recompile: later runs use the new code, tied to the source', () => {
  const lang = language();
  const runner = new ProgramRunner({ language: lang, source: 'print(1)\n', compiled: 'stale', screen: screen() });
  assert.equal(runner.compiled, 'stale');
  const result = runner.recompile();
  assert.deepEqual(result, { ok: true, errorCount: 0, errors: '', scripts: 1, sources: ['print(1)\n'] });
  assert.equal(runner.compiled.sourceHash, sourceHash('print(1)\n'));
  runner.go();
  assert.equal(lang.spawned[0].compiled, runner.compiled);
  assert.equal(describeCompile(result).kind, 'success');
});

test('ProgramRunner.recompile: a failure keeps the code used before', () => {
  const runner = new ProgramRunner({ language: language(), source: 'def (:\n', compiled: 'old', screen: screen() });
  const result = runner.recompile();
  assert.equal(result.ok, false);
  assert.ok(result.errorCount >= 1);
  assert.equal(runner.compiled, 'old');
  assert.match(describeCompile(result).message, /^\d+ compile errors?/);
  assert.equal(describeCompile(result).kind, 'error');
});

test('ProgramRunner.recompile: a language with no compiler fails', () => {
  const runner = new ProgramRunner({ language: { spawn() { return { process: null }; } }, source: 'x', screen: screen() });
  assert.equal(runner.recompile().ok, false);
});

test('ProgramSetRunner.recompile: each script that compiles runs its new code', () => {
  const lang = language();
  const runner = new ProgramSetRunner({
    screen: screen(),
    programs: [
      { name: 'good', language: lang, source: 'print(1)\n', compiled: 'old1' },
      { name: 'bad', language: lang, source: 'def (:\n', compiled: 'old2' },
    ],
  });
  const result = runner.recompile();
  assert.equal(result.ok, false);
  assert.equal(result.scripts, 2);
  assert.match(result.errors, /^bad: /);
  runner.go();
  assert.equal(lang.spawned[0].compiled.sourceHash, sourceHash('print(1)\n'));
  assert.equal(lang.spawned[1].compiled, 'old2');
});

test('ProgramRunner.recompile(sources): an edited source that compiles becomes the source', () => {
  const lang = language();
  const runner = new ProgramRunner({ language: lang, source: 'print(1)\n', screen: screen() });
  const bad = runner.recompile(['def (:\n']);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.sources, ['print(1)\n']);
  const good = runner.recompile(['print(2)\n']);
  assert.equal(good.ok, true);
  assert.deepEqual(good.sources, ['print(2)\n']);
  runner.go();
  assert.equal(lang.spawned[0].source, 'print(2)\n');
  assert.equal(lang.spawned[0].compiled.sourceHash, sourceHash('print(2)\n'));
});

test('ProgramSetRunner.recompile(sources): only changed scripts compile, and run their new source', () => {
  const lang = language();
  const runner = new ProgramSetRunner({
    screen: screen(),
    programs: [
      { name: 'a', language: lang, source: 'print(1)\n', compiled: 'oldA' },
      { name: 'b', language: lang, source: 'print(2)\n', compiled: 'oldB' },
    ],
  });
  const result = runner.recompile(['print(1)\n', 'print(3)\n']);
  assert.equal(result.ok, true);
  assert.equal(result.scripts, 1);
  assert.deepEqual(result.sources, ['print(1)\n', 'print(3)\n']);
  runner.go();
  assert.deepEqual(lang.spawned.map((s) => s.source), ['print(1)\n', 'print(3)\n']);
  assert.equal(lang.spawned[0].compiled, 'oldA');
  assert.equal(lang.spawned[1].compiled.sourceHash, sourceHash('print(3)\n'));
});
