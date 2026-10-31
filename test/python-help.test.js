// The Python documentation (src/ui/python-docs.js, shown by Help > Python
// Documentation) is checked against the language itself: what it says a
// program prints, it prints; what it says is not supported, is not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, compile } from '../src/vm/compiler/python/loader.js';
import { LIST_METHODS, DICT_METHODS, STR_METHODS, EXCEPTION_NAMES } from '../src/vm/runtime/python-builtins.js';
import { PYTHON_DOCS, describeSection, pythonHelpEntries, allParts } from '../src/ui/python-docs.js';

const examples = allParts().filter((p) => p.code && !p.unsupported && !p.screen);
const screens = allParts().filter((p) => p.screen);
const unsupported = allParts().filter((p) => p.unsupported).map((p) => ({ section: p.section, ...p.unsupported }));

const sectionText = (label) => describeSection(PYTHON_DOCS.find((s) => s.label === label));

test('the sections have unique labels, a title and some text', () => {
  const labels = PYTHON_DOCS.map((s) => s.label);
  assert.equal(new Set(labels).size, labels.length);
  for (const entry of pythonHelpEntries()) {
    assert.ok(entry.text.startsWith(`${entry.label}\n${'='.repeat(entry.label.length)}\n`), entry.label);
    assert.ok(entry.text.length > 200, `${entry.label} is nearly empty`);
  }
});

for (const [i, e] of examples.entries()) {
  test(`example ${i + 1} (${e.section}) prints what the documentation says`, () => {
    const result = run(e.code, { filename: 'doc.py' });
    assert.deepEqual(result.loadErrors, [], e.code);
    assert.equal(result.error, null, `${result.error}\n${e.code}`);
    assert.deepEqual(result.output, e.output, e.code);
  });
}

test('every example has output or needs a screen, and the ones that need a screen compile', () => {
  for (const e of allParts().filter((p) => p.code && !p.unsupported)) {
    assert.ok(e.output || e.screen, `no output given for:\n${e.code}`);
  }
  for (const e of screens) {
    const { chunk, loadErrors } = compile(e.code, { filename: 'screen.py' });
    assert.ok(chunk, `${e.section}: ${JSON.stringify(loadErrors)}\n${e.code}`);
  }
});

for (const u of unsupported) {
  test(`not supported: ${u.what} still fails`, () => {
    const result = run(u.code, { filename: 'no.py' });
    assert.equal(result.ok, false, `it works now: update the documentation\n${u.code}`);
  });
}

test('the names the documentation says are missing are still missing', () => {
  const text = sectionText('Not supported');
  const list = text.match(/NameError: ([^]*?)\nNot methods/)[1].replace(/\s+/g, ' ');
  const names = list.split(',').map((n) => n.trim().replace(/\.$/, '')).filter((n) => /^[a-z_]+$/.test(n));
  assert.ok(names.length >= 20, `found ${names.length} names`);
  const result = run('print(dir(__builtins__))', { filename: 'dir.py' });
  for (const name of names) assert.ok(!result.output[0].includes(`'${name}'`), `${name} exists now: update the documentation`);
  const strMethods = text.match(/Not methods of a string: ([^]*?)\.\n/)[1].split(',').map((n) => n.trim());
  for (const m of strMethods) assert.ok(!STR_METHODS.includes(m), `str.${m} exists now: update the documentation`);
});

test('every built-in function, exception and method is mentioned in its section', () => {
  const builtins = run('print(dir(__builtins__))', { filename: 'dir.py' }).output[0];
  const names = [...builtins.matchAll(/'([a-z_][a-z_0-9]*)'/g)].map((m) => m[1]).filter((n) => n !== '__name__');
  const functions = sectionText('Built-in functions');
  for (const name of names) assert.ok(functions.includes(`${name}(`), `builtin ${name}() is not documented`);
  const errors = sectionText('Errors');
  for (const name of EXCEPTION_NAMES) assert.ok(errors.includes(name), `${name} is not documented`);
  const lists = sectionText('Lists, tuples and dicts');
  for (const m of LIST_METHODS) assert.ok(lists.includes(`${m}(`), `list.${m} is not documented`);
  for (const m of DICT_METHODS) assert.ok(lists.includes(`${m}(`), `dict.${m} is not documented`);
  const strings = sectionText('Strings');
  for (const m of STR_METHODS) assert.ok(strings.includes(`${m}(`), `str.${m} is not documented`);
});

test('the functions the documentation lists as built in are built in', () => {
  const functions = sectionText('Built-in functions');
  const listed = [...functions.matchAll(/^ {2}([a-z_]+)\(/gm)].map((m) => m[1]);
  const builtins = run('print(dir(__builtins__))', { filename: 'dir.py' }).output[0];
  for (const name of listed) assert.ok(builtins.includes(`'${name}'`), `${name} is documented but not built in`);
});
