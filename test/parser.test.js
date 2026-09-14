import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseOrThrow } from '../src/index.js';
import { formatAst } from '../src/format.js';

/** Parses one expression by wrapping it in `Print`, and returns the AST node. */
function expr(source) {
  const ast = parseOrThrow(`Print ${source}`);
  return ast.body[0].args[0];
}

/** A compact bracketed rendering, for asserting on tree shape. */
function sexp(node) {
  switch (node.type) {
    case 'Binary': return `(${node.operator} ${sexp(node.left)} ${sexp(node.right)})`;
    case 'Unary': return `(${node.operator} ${sexp(node.operand)})`;
    case 'Apply': return `(${node.name}${node.args.map((a) => ` ${sexp(a)}`).join('')})`;
    case 'Index': return `(${node.name}[] ${sexp(node.index)})`;
    case 'Variable': return node.name;
    case 'NumberLiteral': return String(node.value);
    case 'StringLiteral': return JSON.stringify(node.value);
    case 'BooleanLiteral': return String(node.value);
    case 'NothingLiteral': return 'Nothing';
    default: return `?${node.type}`;
  }
}

function messages(source) {
  return parse(source).errors.map((e) => `${e.line}: ${e.message}`);
}

// ------------------------------------------------------------------ precedence

test('arithmetic precedence and associativity follow section 8', () => {
  assert.equal(sexp(expr('1 + 2 * 3')), '(+ 1 (* 2 3))');
  assert.equal(sexp(expr('1 - 2 - 3')), '(- (- 1 2) 3)');        // left
  assert.equal(sexp(expr('2 ^ 3 ^ 2')), '(^ 2 (^ 3 2))');        // right
  assert.equal(sexp(expr('7 \\ 2 Mod 3')), '(Mod (\\ 7 2) 3)');  // same level, left
});

test('unary minus is looser than ^ but tighter than *', () => {
  assert.equal(sexp(expr('-2 ^ 2')), '(- (^ 2 2))');   // -(2^2)
  assert.equal(sexp(expr('2 ^ -3')), '(^ 2 (- 3))');   // RHS of ^ is a unary-expr
  assert.equal(sexp(expr('-a * b')), '(* (- a) b)');
});

test('& is looser than + so it concatenates the sum', () => {
  assert.equal(sexp(expr('"n=" & a + b')), '(& "n=" (+ a b))');
  assert.equal(sexp(expr('a & b & c')), '(& (& a b) c)');
});

test('comparisons are looser than & and tighter than Not', () => {
  assert.equal(sexp(expr('a & b = c')), '(= (& a b) c)');
  assert.equal(sexp(expr('Not x = y')), '(Not (= x y))');   // the VB reading
});

test('Not, And, Or nest in that order', () => {
  assert.equal(sexp(expr('Not a And b Or c')), '(Or (And (Not a) b) c)');
  assert.equal(sexp(expr('a Or b And c')), '(Or a (And b c))');
});

test('And and Or are marked short-circuit', () => {
  assert.equal(expr('a And b').shortCircuit, true);
  assert.equal(expr('a Or b').shortCircuit, true);
  assert.equal(expr('a + b').shortCircuit, undefined);
});

test('parentheses override precedence and leave no wrapper node', () => {
  assert.equal(sexp(expr('(1 + 2) * 3')), '(* (+ 1 2) 3)');
  assert.equal(expr('(a)').type, 'Variable');
});

test('a call and an index produce the same Apply node (section 9)', () => {
  assert.equal(sexp(expr('Len(s)')), '(Len s)');
  assert.equal(sexp(expr('scores(3)')), '(scores 3)');
  assert.equal(expr('Rnd()').args.length, 0);
});

test('literals', () => {
  assert.equal(sexp(expr('True')), 'true');
  assert.equal(sexp(expr('Nothing')), 'Nothing');
  assert.equal(sexp(expr('"a""b"')), '"a\\"b"');
});

// ------------------------------------------------------------------ statements

test('the three Dim forms', () => {
  const ast = parseOrThrow('Dim a\nDim b = 1\nDim c(9)\n');
  assert.deepEqual(ast.body.map((s) => [s.name, s.init?.type ?? null, s.size?.type ?? null]), [
    ['a', null, null],
    ['b', 'NumberLiteral', null],
    ['c', null, 'NumberLiteral'],
  ]);
});

test('assignment to a variable and to an array element', () => {
  const ast = parseOrThrow('total = total + 1\nscores(3) = 99\n');
  assert.equal(ast.body[0].target.type, 'Variable');
  assert.equal(sexp(ast.body[1].target), '(scores[] 3)');
});

test('= is assignment at statement level and equality inside the expression', () => {
  const ast = parseOrThrow('found = (name = "peter")\n');
  assert.equal(ast.body[0].type, 'AssignStatement');
  assert.equal(sexp(ast.body[0].value), '(= name "peter")');
});

test('a call statement needs parentheses; a bare name is an error', () => {
  assert.equal(parseOrThrow('Beep()\n').body[0].type, 'CallStatement');
  assert.match(messages('Beep\n')[0], /a call statement needs parentheses/);
});

test('Print takes zero or more comma-separated expressions', () => {
  assert.equal(parseOrThrow('Print\n').body[0].args.length, 0);
  assert.equal(parseOrThrow('Print 1, 2, 3\n').body[0].args.length, 3);
});

test('block If with ElseIf and Else', () => {
  const ast = parseOrThrow([
    'If a Then', '  Print 1',
    'ElseIf b Then', '  Print 2',
    'ElseIf c Then', '  Print 3',
    'Else', '  Print 4',
    'End If', '',
  ].join('\n'));
  const node = ast.body[0];
  assert.equal(node.branches.length, 3);
  assert.equal(node.elseBody.length, 1);
  assert.equal(node.singleLine, false);
});

test('single-line If takes one statement and no Else', () => {
  const node = parseOrThrow('If n < 0 Then Print "negative"\n').body[0];
  assert.equal(node.singleLine, true);
  assert.equal(node.branches[0].body.length, 1);
  assert.equal(node.elseBody, null);
  assert.match(messages('If a Then Print 1 Else Print 2\n')[0], /single-line 'If' form takes no/);
});

test('While and For, with and without Step', () => {
  const ast = parseOrThrow([
    'While i <= 10', '  i = i + 1', 'End While',
    'For i = 1 To 10', '  Print i', 'Next',
    'For i = Len(s) To 1 Step -1', '  Print i', 'Next', '',
  ].join('\n'));
  assert.equal(ast.body[0].type, 'WhileStatement');
  assert.equal(ast.body[1].step, null);
  assert.equal(sexp(ast.body[2].step), '(- 1)');
  assert.equal(ast.body[2].variable, 'i');
});

test('Next takes no variable name', () => {
  assert.match(messages('For i = 1 To 3\nNext i\n')[0], /'Next' takes no variable name/);
});

test('Exit must be inside a matching loop', () => {
  assert.equal(parse('For i = 1 To 3\n  Exit For\nNext\n').errors.length, 0);
  assert.equal(parse('While a\n  Exit While\nEnd While\n').errors.length, 0);
  assert.match(messages('Exit For\n')[0], /not inside a 'For' loop/);
  assert.match(messages('While a\n  Exit For\nEnd While\n')[0], /not inside a 'For' loop/);
});

test('a loop does not leak across a procedure boundary', () => {
  const source = ['For i = 1 To 3', 'Next', '', 'Sub S()', '  Exit For', 'End Sub', ''].join('\n');
  assert.match(messages(source)[0], /not inside a 'For' loop/);
});

// ----------------------------------------------------------------- procedures

test('Sub and Function declarations are hoisted out of the statement list', () => {
  const ast = parseOrThrow([
    'Print Area(3, 4)', '',
    'Function Area(w, h)', '  Return w * h', 'End Function',
    'Sub Greet(name)', '  Print name', 'End Sub', '',
  ].join('\n'));
  assert.equal(ast.body.length, 1);
  assert.deepEqual(ast.procedures.map((p) => [p.kind, p.name, p.params.length]), [
    ['Function', 'Area', 2],
    ['Sub', 'Greet', 1],
  ]);
});

test('Return rules differ between Sub and Function', () => {
  assert.equal(parse('Function F()\n  Return 1\nEnd Function\n').errors.length, 0);
  assert.equal(parse('Sub S()\n  Return\nEnd Sub\n').errors.length, 0);
  assert.match(messages('Function F()\n  Return\nEnd Function\n')[0], /must return a value/);
  assert.match(messages('Sub S()\n  Return 1\nEnd Sub\n')[0], /cannot return a value/);
  assert.match(messages('Return 1\n')[0], /only allowed inside a 'Sub' or 'Function'/);
});

test('duplicate procedure and parameter names are load errors', () => {
  assert.match(messages('Sub A()\nEnd Sub\nSub A()\nEnd Sub\n')[0], /already declared on line 1/);
  assert.match(messages('Sub A(x, x)\nEnd Sub\n')[0], /parameter 'x' is already declared/);
});

test('procedures cannot nest', () => {
  const source = ['Sub Outer()', '  Sub Inner()', '  End Sub', 'End Sub', ''].join('\n');
  assert.match(messages(source)[0], /procedures cannot be nested/);
});

// ----------------------------------------------------------- error collection

test('every load error in the file is reported, not just the first', () => {
  const errors = messages(['Dim', 'Print )', 'notacall', ''].join('\n'));
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map((m) => m.split(':')[0]), ['1', '2', '3']);
});

test('a reserved word cannot be used as a name', () => {
  assert.match(messages('Dim Next\n')[0], /reserved word and cannot be used as a name/);
});

test('one statement per line', () => {
  assert.match(messages('Dim x = 1 Dim y = 2\n')[0], /one statement per line/);
});

test('an unterminated block points at the line that opened it', () => {
  const [message] = messages('While a\n  Print 1\n');
  assert.match(message, /^1: unterminated 'While' block/);
});

test('a mismatched End reports once instead of cascading', () => {
  const errors = messages(['If a Then', '  Print 1', 'End While', ''].join('\n'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected 'End If' to close the 'If' opened on line 1, found 'End While'/);
});

test('an array declaration cannot carry an initialiser', () => {
  assert.match(messages('Dim a(3) = 1\n')[0], /cannot have an initialiser/);
});

test('you cannot assign to a call with the wrong number of indices', () => {
  assert.match(messages('a(1, 2) = 3\n')[0], /takes exactly one index, found 2/);
  assert.match(messages('a() = 3\n')[0], /needs exactly one index/);
});

test('the parser always returns an AST, even for a broken file', () => {
  const { ast, ok } = parse('Dim\nPrint 1\n');
  assert.equal(ok, false);
  assert.equal(ast.type, 'Program');
  assert.ok(ast.body.length >= 1);
});

// ------------------------------------------------------------------- round trip

test('the spec samples parse clean', () => {
  const fizzbuzz = [
    'For n = 1 To 20',
    '  If n Mod 15 = 0 Then',
    '    Print "FizzBuzz"',
    '  ElseIf n Mod 3 = 0 Then',
    '    Print "Fizz"',
    '  ElseIf n Mod 5 = 0 Then',
    '    Print "Buzz"',
    '  Else',
    '    Print n',
    '  End If',
    'Next',
    '',
  ].join('\n');
  const { ok, ast } = parse(fizzbuzz);
  assert.equal(ok, true);
  assert.equal(ast.body[0].type, 'ForStatement');
  assert.ok(formatAst(ast).startsWith('(program'));
});
