// src/ui/program-runner.js: ProgramSetRunner starts a project's scripts in order on one screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgramSetRunner } from '../src/ui/program-runner.js';

test('ProgramSetRunner: clears the screen once, then starts every program in order', () => {
  const started = [];
  // A language whose spawn makes no process, so the StatusBar and the
  // scheduler (which need a page) are not touched.
  const language = {
    spawn(source, options) {
      started.push(`${options.name}:${source}:${options.output.text === '' ? 'clear' : 'dirty'}`);
      return { process: null, errorCount: 0 };
    },
  };
  let cleared = 0;
  const screen = { textPanel: { text: 'old' }, clearWidgets: () => { cleared += 1; }, host: {} };
  const runner = new ProgramSetRunner({
    screen,
    programs: [
      { name: 'one', language, source: 'A' },
      { name: 'two', language, source: 'B' },
      { name: 'three', language, source: 'C' },
    ],
  });
  assert.deepEqual(runner.go(), []);
  assert.deepEqual(started, ['one:A:clear', 'two:B:clear', 'three:C:clear']);
  assert.equal(cleared, 1);
  assert.equal(runner.process, null);
  runner.reset();
  assert.equal(cleared, 2);
});
