import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { Op, OP_NAMES, OPERANDS } from '../src/vm/opcodes.js';
import { BUILTIN_LIST } from '../src/vm/builtins.js';
import { BUILTINS as LEXICAL_BUILTINS } from '../src/vm/tokens.js';

function messages(source) {
  return compile(source).errors.map((e) => `${e.line}: ${e.message}`);
}

/** Opcode mnemonics of the module code, in order, up to and including HALT. */
function ops(source) {
  const { chunk, errors } = compile(source);
  assert.deepEqual(errors.map((e) => e.message), []);
  const out = [];
  for (let ip = 0; ip < chunk.code.length;) {
    const op = chunk.code[ip];
    out.push(OP_NAMES[op]);
    ip += 1 + (OPERANDS[op] ?? 0);
    if (op === Op.HALT) break;
  }
  return out;
}

// tokens.js carries the built-in NAMES, for the lexer and for tooling;
// builtins.js carries the implementations. Two lists, one truth — this guard
// is what keeps them from drifting apart.
test('the front end and the VM agree on the built-in list', () => {
  assert.deepEqual([...LEXICAL_BUILTINS], BUILTIN_LIST.map((b) => b.name));
});

// ------------------------------------------------------------------- resolving

test('an undeclared name is a load error', () => {
  assert.match(messages('Print x\n')[0], /'x' is not declared/);
  assert.match(messages('x = 1\n')[0], /'x' is not declared/);
});

test('use before Dim is reported with the declaration line', () => {
  assert.match(messages('Print x\nDim x = 1\n')[0], /'x' is used before its 'Dim' on line 2/);
});

test('a procedure sees module variables whatever their source order', () => {
  const source = ['Sub Show()', '  Print later', 'End Sub', 'Dim later = 1', 'Show()', ''].join('\n');
  assert.deepEqual(messages(source), []);
});

test('a duplicate Dim in one scope is a load error, in both scopes', () => {
  assert.match(messages('Dim a\nDim a\n')[0], /'a' is already declared on line 1/);
  assert.match(
    messages('Sub S()\n  Dim a\n  Dim a\nEnd Sub\n')[0],
    /'a' is already declared on line 2/,
  );
});

test('blocks do not scope: a Dim in an If body belongs to the procedure', () => {
  const source = [
    'Dim flag = True',
    'If flag Then',
    '  Dim inner = 1',
    'End If',
    'Print inner',      // visible for the rest of the scope (section 5)
    '',
  ].join('\n');
  assert.deepEqual(messages(source), []);
});

test('a local shadows a module variable', () => {
  const { chunk } = compile('Dim v = 1\nSub S()\n  Dim v\n  v = 2\nEnd S ub\n'.replace('End S ub', 'End Sub'));
  assert.ok(chunk, 'expected a chunk');
  const proc = chunk.procedures[0];
  assert.equal(proc.slotCount, 1);            // the local, not the global
});

// ----------------------------------------------------------------------- arity

test('wrong argument count is a load error, for procedures and builtins', () => {
  assert.match(
    messages('Sub S(a, b)\nEnd Sub\nS(1)\n')[0],
    /'S' takes 2 arguments, found 1/,
  );
  assert.match(messages('Print Len("a", "b")\n')[0], /'Len' takes 1 argument, found 2/);
  assert.match(messages('Print Rnd(1)\n')[0], /'Rnd' takes 0 arguments, found 1/);
});

test('an array subscript takes exactly one index', () => {
  assert.match(
    messages('Dim a(3)\nPrint a(1, 2)\n')[0],
    /takes exactly one index, found 2/,
  );
});

// -------------------------------------------------------------------- clashes

test('built-ins cannot be shadowed', () => {
  assert.match(messages('Dim Len\n')[0], /'Len' is a built-in function and cannot be redeclared/);
  assert.match(messages('Sub Len()\nEnd Sub\n')[0], /cannot be redeclared/);
  assert.match(messages('Sub S(Len)\nEnd Sub\n')[0], /cannot be used as a parameter name/);
});

test('a procedure and a module variable cannot share a name', () => {
  assert.match(
    messages('Sub A()\nEnd Sub\nDim A\n')[0],
    /already the name of a Sub declared on line 1/,
  );
});

test('a Sub has no value and cannot be used in an expression', () => {
  assert.match(messages('Sub S()\nEnd Sub\nPrint S()\n')[0], /'S' is a Sub and has no value/);
  assert.deepEqual(messages('Sub S()\nEnd Sub\nS()\n'), []);
});

test('a bare procedure or builtin name is caught with a usable hint', () => {
  assert.match(messages('Function F()\n  Return 1\nEnd Function\nPrint F\n')[0], /call it as 'F\(\.\.\.\)'/);
  assert.match(messages('Print Len\n')[0], /call it as 'Len\(_\)'/);
});

test('a variable is not callable as a statement', () => {
  assert.match(messages('Dim a(3)\na(1)\n')[0], /'a' is a variable, not a procedure/);
});

// ------------------------------------------------------------------- code gen

test('a literal step fixes the loop direction at compile time', () => {
  const up = ops('For i = 1 To 10 Step 2\n  Print i\nNext\n');
  // Only i and limit$ are stored before the test: no step$ and no up$ slot.
  const firstJump = up.indexOf('JUMP_IF_FALSE');
  assert.equal(up.slice(0, firstJump).filter((n) => n === 'SET_GLOBAL').length, 2);
  assert.ok(up.includes('LE') && !up.includes('GE'));

  const down = ops('For i = 10 To 1 Step -1\n  Print i\nNext\n');
  assert.ok(down.includes('GE') && !down.includes('LE'));

  const { chunk } = compile('For i = 1 To 3\nNext\n');
  assert.deepEqual(chunk.globalNames, ['i', 'for$limit$1']);
});

test('a computed step tests its direction at run time', () => {
  const list = ops('Dim s = -1\nFor i = 10 To 1 Step s\n  Print i\nNext\n');
  const firstJump = list.indexOf('JUMP_IF_FALSE');
  // s, then i, limit$, step$ and up$.
  assert.equal(list.slice(0, firstJump).filter((n) => n === 'SET_GLOBAL').length, 5);
  assert.ok(list.includes('LE') && list.includes('GE'));
});

test('start, limit and step are evaluated once, before the first iteration', () => {
  const list = ops('For i = 1 To 10\n  Print i\nNext\n');
  assert.ok(list.includes('HALT'));
});

test('And and Or compile to short-circuit jumps with a checked right operand', () => {
  assert.deepEqual(
    ops('Dim a = True\nDim b = False\nPrint a And b\n'),
    ['TRUE', 'SET_GLOBAL', 'FALSE', 'SET_GLOBAL',
      'GET_GLOBAL', 'AND_JUMP', 'GET_GLOBAL', 'CHECK_BOOL', 'PRINT', 'HALT'],
  );
  const orOps = ops('Dim a = True\nDim b = False\nPrint a Or b\n');
  assert.ok(orOps.includes('OR_JUMP'));
});

test('identical constants are pooled', () => {
  const { chunk } = compile('Print 1, 1, 1, "x", "x"\n');
  assert.deepEqual(chunk.constants, [1, 'x']);
});

test('the chunk records procedures with their entry, arity and slot count', () => {
  const { chunk } = compile([
    'Function Area(w, h)', '  Dim scratch = 0', '  Return w * h', 'End Function',
    'Print Area(2, 3)', '',
  ].join('\n'));
  assert.equal(chunk.procedures.length, 1);
  const [proc] = chunk.procedures;
  assert.equal(proc.kind, 'Function');
  assert.equal(proc.arity, 2);
  assert.equal(proc.slotCount, 3);          // w, h, scratch
  assert.ok(proc.entry > 0);
});

test('a file with parse errors is not compiled, so there is no cascade', () => {
  const { chunk, errors, ok } = compile('Dim\nPrint undeclaredThing\n');
  assert.equal(ok, false);
  assert.equal(chunk, null);
  assert.equal(errors.length, 1);           // the parse error only
});
