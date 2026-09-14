import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/index.js';

/** Runs a program and returns its Print output as an array of lines. */
function out(source, options = {}) {
  const result = run(source, { maxSteps: 2_000_000, ...options });
  assert.deepEqual(result.loadErrors.map((e) => `${e.line}: ${e.message}`), []);
  assert.equal(result.error, null, result.error?.message);
  return result.output;
}

/** Runs a program expected to fail at runtime and returns `line: message`. */
function boom(source, options = {}) {
  const result = run(source, { maxSteps: 2_000_000, ...options });
  assert.deepEqual(result.loadErrors.map((e) => e.message), []);
  assert.ok(result.error, 'expected a runtime error');
  return `${result.error.line}: ${result.error.message}`;
}

/** Evaluates one expression. */
const val = (expression) => out(`Print ${expression}\n`)[0];

// -------------------------------------------------------------------- values

test('Print separates values with one space and Nothing prints as empty', () => {
  assert.deepEqual(out('Print 1, "a", True\n'), ['1 a True']);
  assert.deepEqual(out('Dim x\nPrint "[" & x & "]"\n'), ['[]']);
  assert.deepEqual(out('Print\n'), ['']);
});

test('integral Numbers print without a decimal point', () => {
  assert.equal(val('3'), '3');
  assert.equal(val('6 / 2'), '3');
  assert.equal(val('7 / 2'), '3.5');
  assert.equal(val('0 - 0'), '0');
});

// ---------------------------------------------------------------- arithmetic

test('the arithmetic operators of section 8', () => {
  assert.equal(val('2 + 3 * 4'), '14');
  assert.equal(val('2 ^ 10'), '1024');
  assert.equal(val('7 \\ 2'), '3');
  assert.equal(val('-7 \\ 2'), '-3');        // truncates toward zero
  assert.equal(val('7 Mod 3'), '1');
  assert.equal(val('-7 Mod 3'), '-1');       // takes the sign of the left
  assert.equal(val('7 Mod -3'), '1');
});

test('+ is Numbers only; & converts both sides', () => {
  assert.match(boom('Print "a" + 1\n'), /operator \+ expects Number, Number but got String, Number/);
  assert.equal(val('"a" & 1'), 'a1');
  assert.equal(val('1 & 2'), '12');
  assert.equal(val('True & "!"'), 'True!');
});

test('division by zero is a runtime error for /, \\ and Mod', () => {
  for (const expression of ['1 / 0', '1 \\ 0', '1 Mod 0']) {
    assert.match(boom(`Print ${expression}\n`), /division by zero/);
  }
});

// ---------------------------------------------------------------- comparison

test('comparisons require the same type on both sides', () => {
  assert.equal(val('1 < 2'), 'True');
  assert.equal(val('"apple" < "banana"'), 'True');
  assert.match(boom('Print 1 = "1"\n'), /expects the same type on both sides/);
  assert.match(boom('Print True < False\n'), /expects two Numbers or two Strings/);
});

test('= and <> accept Nothing on either side', () => {
  assert.equal(out('Dim x\nPrint x = Nothing\n')[0], 'True');
  assert.equal(out('Dim x = 1\nPrint x = Nothing\n')[0], 'False');
  assert.equal(out('Dim x = 1\nPrint x <> Nothing\n')[0], 'True');
});

// --------------------------------------------------------------------- logic

test('conditions must be Boolean: there is no truthiness', () => {
  assert.match(boom('If 1 Then\nPrint "x"\nEnd If\n'), /a condition expects a Boolean, got Number/);
  assert.match(boom('Dim s = "a"\nWhile s\nEnd While\n'), /a condition expects a Boolean, got String/);
});

test('And and Or short-circuit', () => {
  // The right operand is never evaluated, so its would-be error never fires.
  assert.equal(val('False And 1 = "x"'), 'False');
  assert.equal(val('True Or 1 = "x"'), 'True');
  // When it is evaluated, its type is still checked.
  assert.match(boom('Print True And 1\n'), /a logical operand expects a Boolean, got Number/);
});

test('Not binds below the comparisons', () => {
  assert.equal(val('Not 1 = 2'), 'True');
  assert.match(boom('Print Not 1\n'), /operator 'Not' expects a Boolean, got Number/);
});

// ----------------------------------------------------------- control flow

test('If, ElseIf and Else pick exactly one branch', () => {
  const program = (n) => [
    `Dim n = ${n}`,
    'If n > 10 Then', '  Print "big"',
    'ElseIf n > 5 Then', '  Print "medium"',
    'Else', '  Print "small"',
    'End If', '',
  ].join('\n');
  assert.deepEqual(out(program(20)), ['big']);
  assert.deepEqual(out(program(7)), ['medium']);
  assert.deepEqual(out(program(1)), ['small']);
});

test('For counts up, counts down, and evaluates its bounds once', () => {
  assert.deepEqual(out('For i = 1 To 3\n  Print i\nNext\n'), ['1', '2', '3']);
  assert.deepEqual(out('For i = 3 To 1 Step -1\n  Print i\nNext\n'), ['3', '2', '1']);
  assert.deepEqual(out('For i = 1 To 0\n  Print i\nNext\nPrint "done"\n'), ['done']);

  // Section 6: changing the limit inside the body has no effect.
  assert.deepEqual(
    out('Dim n = 3\nFor i = 1 To n\n  n = 99\n  Print i\nNext\n'),
    ['1', '2', '3'],
  );
});

test('For evaluates start, limit and step before assigning the loop variable', () => {
  // The limit must see the old i, not the 1 the loop just assigned.
  assert.deepEqual(out('Dim i = 5\nFor i = 1 To i\n  Print i\nNext\n'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(out('Dim n = 3\nFor i = 1 To n Step n - 2\n  Print i\nNext\n'), ['1', '2', '3']);
});

test('the For variable survives the loop with its last value', () => {
  assert.deepEqual(out('For i = 1 To 3\nNext\nPrint i\n'), ['4']);
});

test('While repeats until its condition is False', () => {
  assert.deepEqual(
    out('Dim i = 0\nWhile i < 3\n  Print i\n  i = i + 1\nEnd While\n'),
    ['0', '1', '2'],
  );
});

test('Exit leaves the nearest matching loop', () => {
  assert.deepEqual(
    out('For i = 1 To 10\n  If i = 3 Then Exit For\n  Print i\nNext\nPrint "after"\n'),
    ['1', '2', 'after'],
  );
  assert.deepEqual(
    out([
      'For i = 1 To 2',
      '  For j = 1 To 10',
      '    If j = 2 Then Exit For',
      '    Print i & "," & j',
      '  Next',
      'Next', '',
    ].join('\n')),
    ['1,1', '2,1'],
  );
});

// ---------------------------------------------------------------- procedures

test('calls, recursion, and call before declaration', () => {
  assert.deepEqual(out([
    'Print Fib(10)',
    'Function Fib(n)',
    '  If n < 2 Then Return n',
    '  Return Fib(n - 1) + Fib(n - 2)',
    'End Function', '',
  ].join('\n')), ['55']);
});

test('arguments pass by value', () => {
  assert.deepEqual(out([
    'Sub Bump(n)', '  n = n + 1', '  Print n', 'End Sub',
    'Dim v = 1', 'Bump(v)', 'Print v', '',
  ].join('\n')), ['2', '1']);
});

test('an array argument copies the reference, so element writes are visible', () => {
  assert.deepEqual(out([
    'Sub Fill(a)', '  a(0) = 42', 'End Sub',
    'Dim data(2)', 'Fill(data)', 'Print data(0)', '',
  ].join('\n')), ['42']);
});

test("a procedure's For variable is local, even when a module variable shares its name", () => {
  // Regression: `i` exists at module scope only because of the module's own
  // For loop. If Find's loop captured it, the outer loop would never finish.
  assert.deepEqual(out([
    'Function Find(n)',
    '  For i = 1 To 10',
    '    If i = n Then Return i * 100',
    '  Next',
    '  Return 0',
    'End Function',
    'Dim total = 0',
    'For i = 1 To 3',
    '  total = total + Find(i)',
    'Next',
    'Print total, i', '',
  ].join('\n'), { maxSteps: 100000 }), ['600 4']);
});

test('a procedure reuses its own Dim or parameter as a loop variable', () => {
  assert.deepEqual(out([
    'Function Last(stop)', '  For stop = 1 To stop', '  Next', '  Return stop', 'End Function',
    'Print Last(4)', '',
  ].join('\n')), ['5']);
});

test('nested calls keep the value stack balanced', () => {
  assert.deepEqual(out([
    'Function Wrap(n)', '  If n <= 0 Then Return 0', '  Return n + Wrap(n - 1)', 'End Function',
    'Print Wrap(3) + Wrap(4) * 2', '',
  ].join('\n')), ['26']);   // 6 + 10*2
});

test('a Sub falling off its End returns Nothing; a Function is an error', () => {
  assert.deepEqual(out('Sub S()\n  Print "ran"\nEnd Sub\nS()\n'), ['ran']);
  assert.match(
    boom('Function F()\n  Print "ran"\nEnd Function\nPrint F()\n'),
    /Function 'F' ended without returning a value/,
  );
});

test('a runaway recursion is a runtime error, not a crash', () => {
  const result = run('Function F(n)\n  Return F(n + 1)\nEnd Function\nPrint F(1)\n', { maxDepth: 200 });
  assert.match(result.error.message, /call stack exhausted at 200 frames/);
});

test('a runtime error carries a traceback of call sites', () => {
  const result = run([
    'Function Outer()', '  Return Inner()', 'End Function',
    'Function Inner()', '  Return 1 / 0', 'End Function',
    'Print Outer()', '',
  ].join('\n'));
  assert.deepEqual(
    result.error.traceback.map((f) => `${f.kind} ${f.name}@${f.line}`),
    ['Function Inner@2', 'Function Outer@7'],
  );
});

// -------------------------------------------------------------------- arrays

test('arrays are 0..n, start as Nothing, and are bounds-checked', () => {
  assert.deepEqual(out('Dim a(2)\nPrint UBound(a)\nPrint a(0) = Nothing\n'), ['2', 'True']);
  assert.match(boom('Dim a(2)\nPrint a(3)\n'), /index 3 is out of range 0\.\.2/);
  assert.match(boom('Dim a(2)\nPrint a(-1)\n'), /index -1 is out of range 0\.\.2/);
  assert.match(boom('Dim a(2)\nPrint a(0.5)\n'), /an array index must be a whole Number/);
  assert.match(boom('Dim a(-1)\n'), /an array bound must be 0 or more/);
});

test('arrays are reference values', () => {
  assert.deepEqual(out([
    'Dim squares(9)',
    'For i = 0 To UBound(squares)', '  squares(i) = i ^ 2', 'Next',
    'Dim alias = squares',
    'alias(0) = -1',
    'Print squares(0), squares(9)', '',
  ].join('\n')), ['-1 81']);
});

test('only an array can be subscripted', () => {
  assert.match(boom('Dim s = "hi"\nPrint s(0)\n'), /only an Array can be subscripted, got String/);
});

// ------------------------------------------------------------------ builtins

test('string builtins are 1-based and truncate rather than error', () => {
  assert.equal(val('Len("hello")'), '5');
  assert.equal(val('Mid("hello", 2, 3)'), 'ell');
  assert.equal(val('Mid("hello", 4, 99)'), 'lo');       // truncates past the end
  assert.equal(val('Mid("hello", 9, 1)'), '');
  assert.equal(val('InStr("hello", "ll")'), '3');
  assert.equal(val('InStr("hello", "z")'), '0');
  assert.equal(val('UCase("aB") & LCase("aB") & Trim("  x  ")'), 'ABabx');
});

test('Str and Val round-trip, and Val is strict about its input', () => {
  assert.equal(val('Str(42)'), '42');
  assert.equal(val('Val("1.5e3")'), '1500');
  assert.match(boom('Print Val("12abc")\n'), /Val expects a numeric String/);
  assert.match(boom('Print Val("-3")\n'), /Val expects a numeric String/);   // no sign in a NUMBER literal
});

test('the numeric and character builtins', () => {
  assert.equal(val('Int(-3.7)'), '-3');       // truncates toward zero
  assert.equal(val('Abs(-3.5)'), '3.5');
  assert.equal(val('Sqr(16)'), '4');
  assert.match(boom('Print Sqr(-1)\n'), /Sqr expects a Number of 0 or more/);
  assert.equal(val('Chr(65) & Chr(10) = "A" & Chr(10)'), 'True');
  assert.equal(val('Asc("A")'), '65');
  assert.match(boom('Print Asc("")\n'), /at least one character/);
});

test('Rnd uses the injected random source', () => {
  assert.deepEqual(out('Print Rnd()\nPrint Rnd()\n', { random: () => 0.25 }), ['0.25', '0.25']);
});

test('builtins check their argument types', () => {
  assert.match(boom('Print Len(1)\n'), /Len expects a String as argument 1, got Number/);
  assert.match(boom('Dim a(1)\nPrint Len(a)\n'), /Len expects a String as argument 1, got Array/);
  assert.match(boom('Print UBound("x")\n'), /UBound expects an Array, got String/);
});

// ------------------------------------------------------------------- budgets

test('the instruction budget stops a non-terminating program', () => {
  const result = run('While True\nEnd While\n', { maxSteps: 5000 });
  assert.match(result.error.message, /instruction budget of 5000 exhausted/);
});

test('Step 0 loops forever, as it does in VB', () => {
  const result = run('For i = 1 To 10 Step 0\nNext\n', { maxSteps: 5000 });
  assert.match(result.error.message, /instruction budget/);
});

// ---------------------------------------------------------------- whole files

test('FizzBuzz produces the expected 20 lines', () => {
  const lines = out([
    'For n = 1 To 20',
    '  If n Mod 15 = 0 Then', '    Print "FizzBuzz"',
    '  ElseIf n Mod 3 = 0 Then', '    Print "Fizz"',
    '  ElseIf n Mod 5 = 0 Then', '    Print "Buzz"',
    '  Else', '    Print n',
    '  End If',
    'Next', '',
  ].join('\n'));
  assert.equal(lines.length, 20);
  assert.deepEqual(lines.slice(0, 5), ['1', '2', 'Fizz', '4', 'Buzz']);
  assert.equal(lines[14], 'FizzBuzz');
});
