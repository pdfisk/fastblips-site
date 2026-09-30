import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/vm/compiler/basic/lexer.js';
import { TokenType } from '../src/vm/compiler/basic/tokens.js';

/** Token type/text pairs, with the trailing NEWLINE and EOF dropped. */
function shape(source) {
  const { tokens } = tokenize(source);
  return tokens
    .slice(0, -2)
    .map((t) => [t.type, t.text ?? t.value]);
}

function errorsOf(source) {
  return tokenize(source).errors.map((e) => e.message);
}

test('keywords are case-insensitive and carry a canonical spelling', () => {
  const { tokens } = tokenize('dim DIM Dim');
  assert.equal(tokens.length, 5);           // 3 keywords + NEWLINE + EOF
  for (const token of tokens.slice(0, 3)) {
    assert.equal(token.type, TokenType.Keyword);
    assert.equal(token.canonical, 'Dim');
  }
  assert.deepEqual(tokens.slice(0, 3).map((t) => t.value), ['dim', 'DIM', 'Dim']);
});

test('identifiers keep their spelling but fold for comparison', () => {
  const { tokens } = tokenize('Total total');
  assert.deepEqual(tokens.slice(0, 2).map((t) => [t.value, t.lower]), [
    ['Total', 'total'], ['total', 'total'],
  ]);
});

test('builtins are identifiers, not keywords', () => {
  const { tokens } = tokenize('Len');
  assert.equal(tokens[0].type, TokenType.Ident);
});

test('ElseIf is one token', () => {
  assert.deepEqual(shape('ElseIf'), [[TokenType.Keyword, 'ElseIf']]);
});

test("a comment runs to end of line and an apostrophe in a string does not start one", () => {
  assert.deepEqual(shape("Dim x ' this is a comment"), [
    [TokenType.Keyword, 'Dim'], [TokenType.Ident, 'x'],
  ]);
  const { tokens } = tokenize('Dim s = "it\'s fine"');
  assert.equal(tokens[3].type, TokenType.String);
  assert.equal(tokens[3].value, "it's fine");
});

test('"" is an escaped quote', () => {
  const { tokens, errors } = tokenize('Print "she said ""no"" twice"');
  assert.deepEqual(errors, []);
  assert.equal(tokens[1].value, 'she said "no" twice');
});

test('number literals cover the three grammar shapes', () => {
  const { tokens } = tokenize('0 42 3.14 1.5e3 2E-2');
  assert.deepEqual(tokens.slice(0, 5).map((t) => t.value), [0, 42, 3.14, 1500, 0.02]);
});

test('multi-character operators win over their prefixes', () => {
  assert.deepEqual(shape('a <> b <= c >= d < e'), [
    [TokenType.Ident, 'a'], [TokenType.Operator, '<>'],
    [TokenType.Ident, 'b'], [TokenType.Operator, '<='],
    [TokenType.Ident, 'c'], [TokenType.Operator, '>='],
    [TokenType.Ident, 'd'], [TokenType.Operator, '<'],
    [TokenType.Ident, 'e'],
  ]);
});

test('backslash is the integer-division operator', () => {
  assert.deepEqual(shape('7 \\ 2'), [
    [TokenType.Number, '7'], [TokenType.Operator, '\\'], [TokenType.Number, '2'],
  ]);
});

test('runs of blank and comment-only lines collapse to one NEWLINE', () => {
  const { tokens } = tokenize('Dim a\n\n\n   \n\' just a comment\n\nDim b\n');
  const types = tokens.map((t) => t.type);
  assert.deepEqual(types, [
    TokenType.Keyword, TokenType.Ident, TokenType.Newline,
    TokenType.Keyword, TokenType.Ident, TokenType.Newline,
    TokenType.EOF,
  ]);
});

test('a leading blank run emits no NEWLINE, and a missing final one is supplied', () => {
  const { tokens } = tokenize('\n\n\nDim a');
  assert.equal(tokens[0].type, TokenType.Keyword);
  assert.equal(tokens.at(-2).type, TokenType.Newline);
  assert.equal(tokens.at(-1).type, TokenType.EOF);
});

test('CRLF and lone CR both terminate a line', () => {
  const { tokens } = tokenize('Dim a\r\nDim b\rDim c');
  assert.equal(tokens.filter((t) => t.type === TokenType.Newline).length, 3);
  assert.deepEqual(
    tokens.filter((t) => t.type === TokenType.Keyword).map((t) => t.line),
    [1, 2, 3],
  );
});

test('positions are 1-based line and column', () => {
  const { tokens } = tokenize('Dim x\n  Print x');
  const print = tokens.find((t) => t.canonical === 'Print');
  assert.equal(print.line, 2);
  assert.equal(print.column, 3);
});

test('lexical errors are collected, not thrown', () => {
  const { errors } = tokenize('Dim a\nDim b~c\nDim d');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unexpected character '~'/);
  assert.equal(errors[0].line, 2);
});

test('an unterminated string reports and does not swallow the rest of the file', () => {
  const { tokens, errors } = tokenize('Print "oops\nDim x\n');
  assert.match(errors[0].message, /unterminated string literal/);
  assert.ok(tokens.some((t) => t.canonical === 'Dim'));
});

test('type suffixes and stray dots get their own message', () => {
  assert.match(errorsOf('Dim s$')[0], /type suffixes were removed/);
  assert.match(errorsOf('Print .5')[0], /a number needs a digit before the point/);
  assert.match(errorsOf('Print 1.')[0], /digits on both sides/);
  assert.match(errorsOf('Print 1e')[0], /exponent needs digits/);
});
