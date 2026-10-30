import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run, compile } from '../src/vm/compiler/python/loader.js';
import { OP_INFO, SECTIONS, FORMAT } from '../src/vm/opcodes.js';
import { NOTHING } from '../src/vm/values.js';
import { VM } from '../src/vm/vm.js';
import { disassemble } from '../src/vm/disasm.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { ProcessState } from '../src/scheduling/process.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'python');
const examples = join(here, '..', 'examples');

function out(source, options = {}) {
  const result = run(source, { filename: 'test.py', ...options });
  assert.deepEqual(result.loadErrors, []);
  assert.equal(result.error, null, result.error);
  return result.output;
}

function failure(source, options = {}) {
  const result = run(source, { filename: 'test.py', ...options });
  assert.equal(result.ok, false);
  return result;
}

/** Opcode names used by a chunk, walking the flat code array. */
function opcodesOf(chunk) {
  const names = new Set();
  for (let ip = 0; ip < chunk.code.length;) {
    const info = OP_INFO[chunk.code[ip]];
    assert.ok(info, `unknown opcode ${chunk.code[ip]} at ${ip}`);
    names.add(info.name);
    ip += 1 + info.operands.length;
  }
  return names;
}

// ------------------------------------------------------------------ corpus
// Each test/python/NAME.py has NAME.out beside it. For every program that
// CPython can run, NAME.out is CPython's own output; the err_* files end in
// MiniPy's uncaught-exception report instead.

for (const file of readdirSync(corpus).filter((f) => f.endsWith('.py')).sort()) {
  test(`corpus: ${file} matches its expected output`, () => {
    const source = readFileSync(join(corpus, file), 'utf8');
    const expected = readFileSync(join(corpus, file.replace(/\.py$/, '.out')), 'utf8').trimEnd().split('\n');
    const result = run(source, { filename: file });
    assert.deepEqual(result.loadErrors, []);
    const actual = [...result.output, ...(result.error ? result.error.split('\n') : [])];
    assert.deepEqual(actual, expected);
  });
}

// --------------------------------------------------------- one instruction set

test('every opcode has a unique name, a section and known operand kinds', () => {
  const kinds = new Set(['const', 'slot', 'target', 'proc', 'builtin', 'class', 'count', 'fmt', 'flag']);
  const names = new Set();
  OP_INFO.forEach((info, code) => {
    assert.equal(info.code, code);
    assert.ok(!names.has(info.name), `duplicate ${info.name}`);
    names.add(info.name);
    assert.ok(['core', 'crumb', 'python'].includes(info.section), info.name);
    for (const kind of info.operands) assert.ok(kinds.has(kind), `${info.name}: ${kind}`);
  });
  assert.equal(SECTIONS.core.length + SECTIONS.crumb.length + SECTIONS.python.length, OP_INFO.length);
});

test('the MiniPy compiler emits only core and python opcodes', () => {
  const allowed = new Set([...SECTIONS.core, ...SECTIONS.python]);
  for (const file of readdirSync(corpus).filter((f) => f.endsWith('.py'))) {
    const { chunk } = compile(readFileSync(join(corpus, file), 'utf8'), { filename: file });
    for (const name of opcodesOf(chunk)) assert.ok(allowed.has(name), `${file} uses ${name}`);
  }
});

test('Nothing and None are one value; PRINT picks the formatter per instruction', () => {
  const { chunk } = compile('print(None, True, 2.0, 7)\n');
  const printAt = chunk.code.indexOf(OP_INFO.find((i) => i.name === 'PRINT').code);
  assert.equal(chunk.code[printAt + 2], FORMAT.PYTHON);
  assert.deepEqual(out('print(None, True, 2.0, 7)\n'), ['None True 2.0 7']);
  assert.equal(NOTHING, null);
});

test('a condition converts with TRUTHY unless it is already a Boolean', () => {
  const plain = opcodesOf(compile('x = [1]\nif x:\n    pass\n').chunk);
  assert.ok(plain.has('TRUTHY'));
  const compared = opcodesOf(compile('x = 1\nif x < 2:\n    pass\n').chunk);
  assert.ok(!compared.has('TRUTHY'));
});

test('the disassembler lists a MiniPy chunk with its procedures', () => {
  const text = disassemble(compile('def f(a):\n    return a + 1\nprint(f(1))\n', { filename: 'f.py' }).chunk);
  assert.match(text, /\(python\)/);
  assert.match(text, /function f {2}; arity 1/);
  assert.match(text, /PY_ADD/);
  assert.match(text, /CALL_VALUE/);
});

// ------------------------------------------------------------------ numbers

test('int is arbitrary precision and float is a double', () => {
  assert.deepEqual(out('print(2 ** 200)\n'), ['1606938044258990275541962092341162602522202993782792835301376']);
  assert.deepEqual(out('print(7 / 2, 7 // 2, -7 // 2, -7 % 3, 2 ** -1)\n'), ['3.5 3 -4 2 0.5']);
  assert.deepEqual(out('print(1 == 1.0, {1: "a"}[1.0], 3 * 1.0, True + 1)\n'), ['True a 3.0 2']);
});

test('exponents and huge powers', () => {
  assert.deepEqual(out('print(1e16, 2.5e-3, 1e-7)\n'), ['1e+16 0.0025 1e-07']);
  assert.match(failure('print(10 ** 10 ** 10)\n').error, /ValueError: exponent too large/);
});

// ---------------------------------------------------------------- exceptions

test('a MiniPy exception unwinds through frames to a handler in a caller', () => {
  const source = [
    'def inner():',
    '    raise KeyError("k")',
    'def outer():',
    '    return inner()',
    'try:',
    '    outer()',
    'except KeyError as e:',
    '    print("caught", e)',
    'print("after")',
    '',
  ].join('\n');
  assert.deepEqual(out(source), ['caught k', 'after']);
});

test('an uncaught exception reports the raising line and every call site', () => {
  const result = failure('def a():\n    return 1 // 0\ndef b():\n    return a()\nb()\n');
  assert.equal(result.fault.excType, 'ZeroDivisionError');
  assert.equal(result.fault.line, 2);
  assert.deepEqual(result.fault.traceback.map((f) => `${f.name}@${f.line}`), ['a@4', 'b@5']);
});

test('runaway recursion and runaway loops are fatal, not catchable', () => {
  const deep = failure('def f(n):\n    return f(n + 1)\ntry:\n    f(0)\nexcept Exception:\n    print("no")\n');
  assert.equal(deep.fault.excType, 'RecursionError');
  assert.deepEqual(deep.output, []);
  const loop = failure('while True:\n    pass\n', { maxSteps: 1000 });
  assert.match(loop.error, /Fatal: instruction budget of 1000 exceeded/);
});

test('a name read before assignment is a catchable NameError', () => {
  assert.deepEqual(
    out('try:\n    print(nope)\nexcept NameError as e:\n    print(e)\n'),
    ["name 'nope' is not defined"],
  );
});

test('break and continue drop the handlers of try blocks they leave', () => {
  const source = [
    'for i in range(5):',
    '    try:',
    '        if i == 1:',
    '            continue',
    '        if i == 3:',
    '            break',
    '    except ValueError:',
    '        pass',
    'try:',
    '    raise TypeError("t")',
    'except TypeError:',
    '    print("outer handler still right", i)',
    '',
  ].join('\n');
  assert.deepEqual(out(source), ['outer handler still right 3']);
});

test('Windows (\\r\\n) and old Mac (\\r) line endings are line breaks', () => {
  const source = 'def f(x):\n    if x:\n        return "yes"\n    return "no"\nprint(f(1), f(0))\n';
  assert.deepEqual(out(source.replace(/\n/g, '\r\n')), ['yes no']);
  assert.deepEqual(out(source.replace(/\n/g, '\r')), ['yes no']);
  const r = failure('x = 1\r\ny = x + "a"\r\n');
  assert.equal(r.fault.line, 2);
  assert.match(r.error, /test\.py:2:     y = x \+ "a"$/m);
});

test('load errors are collected', () => {
  let r = failure('return 1\n');
  assert.match(r.loadErrors[0], /test\.py:1: error: 'return' outside function/);
  r = failure('for i in range(2):\n    try:\n        break\n    finally:\n        pass\n');
  assert.match(r.loadErrors[0], /'break' out of a 'try' with a 'finally' is not supported/);
});

// ------------------------------------------------------------- scheduling

test('MiniPy runs in slices: runSlice resumes where it stopped', () => {
  const { chunk } = compile('t = 0\nfor i in range(1000):\n    t += i\nprint(t)\n');
  const lines = [];
  const vm = new VM(chunk, { out: (t) => lines.push(t) });
  let slices = 0;
  while (!vm.runSlice(50)) slices += 1;
  assert.ok(slices > 10);
  assert.deepEqual(lines, ['499500']);
});

test('sleep() parks a MiniPy process', () => {
  let clock = 0;
  const lines = [];
  const scheduler = new Scheduler({ quantum: 100, now: () => clock });
  const { chunk } = compile('print("a")\nsleep(0.5)\nprint("b")\n');
  const proc = scheduler.spawn(chunk, { out: (t) => lines.push(t) });
  scheduler.runAll();
  assert.equal(proc.state, ProcessState.SLEEPING);
  assert.deepEqual(lines, ['a']);
  clock = 500;
  scheduler.runAll();
  assert.equal(proc.state, ProcessState.DONE);
  assert.deepEqual(lines, ['a', 'b']);
});

test('an uncaught MiniPy exception fails only its own process', () => {
  const scheduler = new Scheduler({ quantum: 10, now: () => 0 });
  const bad = scheduler.spawn(compile('x = [1][5]\n').chunk, { out: () => {} });
  const lines = [];
  const good = scheduler.spawn(compile('print("fine")\n').chunk, { out: (t) => lines.push(t) });
  scheduler.runAll();
  assert.equal(bad.state, ProcessState.FAILED);
  assert.equal(bad.error.excType, 'IndexError');
  assert.equal(good.state, ProcessState.DONE);
  assert.deepEqual(lines, ['fine']);
});

test('transcript() prints to the transcript sink the way print() prints', () => {
  const transcript = [];
  const source = 'transcript("log")\ntranscript("n =", 3, 2.0, None, [1])\ntranscript()\nprint("out")\n';
  assert.deepEqual(out(source, { transcript: (t) => transcript.push(t) }), ['out']);
  assert.deepEqual(transcript, ['log', 'n = 3 2.0 None [1]', '']);
});

test('without a transcript sink, transcript() goes to the output', () => {
  assert.deepEqual(out('transcript("a", 1)\nprint("b")\n'), ['a 1', 'b']);
});

// ------------------------------------------------------------------ random

test('random(), randint(), choice() and shuffle() draw from the VM random source', () => {
  // A source that counts 0.0, 0.1, 0.2 ... 0.9 and starts again, so the answers are known.
  let n = 0;
  const random = () => ((n++) % 10) / 10;
  assert.deepEqual(out('print(random(), random(), random())', { random }), ['0.0 0.1 0.2']);
  n = 0;
  assert.deepEqual(out('print(randint(1, 6), randint(1, 6), randint(1, 6), randint(5, 5))', { random }), ['1 1 2 5']);
  n = 0;
  assert.deepEqual(out('print(choice([10, 20, 30, 40]), choice("abc"), choice((1, 2)))', { random }), ['10 a 1']);
  n = 0;
  // Fisher-Yates from the end: 0.0, 0.1, 0.2 pick j = 0, 0, 0 for i = 4, 3, 2 and 0 for i = 1
  assert.deepEqual(out('x = [1, 2, 3, 4, 5]\nshuffle(x)\nprint(x)', { random }), ['[2, 3, 4, 5, 1]']);
});

test('the default random source covers the whole range of randint and keeps the same items when shuffling', () => {
  const lines = out(`
seen = {}
for i in range(600):
    seen[randint(-2, 3)] = 1
print(sorted(list(seen.keys())))
x = list(range(20))
shuffle(x)
print(sorted(x) == list(range(20)))
f = [random() for i in range(300)]
print(min(f) >= 0, max(f) < 1)
`);
  assert.deepEqual(lines, ['[-2, -1, 0, 1, 2, 3]', 'True', 'True True']);
});

test('random functions reject bad arguments with Python exceptions', () => {
  assert.match(failure('randint(2, 1)').error, /ValueError: empty range for randint\(2, 1\)/);
  assert.match(failure('randint(1, 2.5)').error, /TypeError: randint\(\) arguments must be ints/);
  assert.match(failure('choice([])').error, /IndexError: Cannot choose from an empty sequence/);
  assert.match(failure('shuffle("abc")').error, /TypeError: shuffle\(\) expects a list/);
  assert.match(failure('random(1)').error, /TypeError/);
});
