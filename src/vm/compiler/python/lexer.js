// MiniPy lexer: source text -> tokens, with INDENT/DEDENT and f-strings.

import { T, KEYWORDS, Token } from './tokens.js';

const ESCAPES = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"', '0': '\0' };

class LexError {
  constructor(message, line, col) {
    this.message = message;
    this.line = line;
    this.col = col;
  }
}

function lex(source) {
  const tokens = [];
  const errors = [];
  const indentStack = [0];
  let pos = 0, line = 1, col = 1;
  let parenDepth = 0;
  let atLineStart = true;
  let lineHasTokens = false;
  const len = source.length;

  function peek(o = 0) { return source[pos + o]; }
  function advance() {
    const c = source[pos++];
    if (c === '\n') { line++; col = 1; } else { col++; }
    return c;
  }
  function err(msg, ln = line, cl = col) { errors.push(new LexError(msg, ln, cl)); }

  function scanIndent() {
    const start = pos;
    let count = 0;
    let sawTab = false;
    while (pos < len && (peek() === ' ' || peek() === '\t')) {
      if (peek() === '\t') sawTab = true;
      count++;
      advance();
    }
    // Blank or comment-only line: doesn't affect indentation at all.
    if (pos >= len || peek() === '\n' || peek() === '#') {
      if (peek() === '#') { while (pos < len && peek() !== '\n') advance(); }
      if (pos < len && peek() === '\n') advance();
      return null;
    }
    if (sawTab) err('tab in leading whitespace is not allowed', line, 1);
    return count;
  }

  function applyIndent(count) {
    const top = () => indentStack[indentStack.length - 1];
    if (count > top()) {
      indentStack.push(count);
      tokens.push(new Token(T.INDENT, count, line, 1));
    } else if (count < top()) {
      while (indentStack.length > 1 && top() > count) {
        indentStack.pop();
        tokens.push(new Token(T.DEDENT, null, line, 1));
      }
      if (top() !== count) {
        err(`inconsistent dedent: no matching indentation level for column ${count}`, line, 1);
        indentStack.push(count); // recover so we don't cascade
      }
    }
  }

  function isIdentStart(c) { return /[A-Za-z_]/.test(c); }
  function isIdentPart(c) { return /[A-Za-z0-9_]/.test(c); }
  function isDigit(c) { return c >= '0' && c <= '9'; }

  function scanNumber() {
    const startLine = line, startCol = col;
    let s = '';
    while (pos < len && isDigit(peek())) s += advance();
    let isFloat = false;
    if (peek() === '.' && isDigit(peek(1))) {
      isFloat = true;
      s += advance();
      while (pos < len && isDigit(peek())) s += advance();
    }
    tokens.push(new Token(T.NUMBER, { text: s, isFloat, value: parseFloat(s) }, startLine, startCol));
  }

  // Scans a string body starting just after the opening quote. Returns
  // { literal, parts } where parts is only populated for f-strings.
  function scanStringBody(quote, isF) {
    let raw = '';
    const parts = [];
    let litBuf = '';
    const flushLit = () => { if (litBuf) { parts.push({ kind: 'lit', value: litBuf }); litBuf = ''; } };
    while (true) {
      if (pos >= len) { err('unterminated string literal'); break; }
      const c = peek();
      if (c === '\n') { err('unterminated string literal (newline in single-line string)'); break; }
      if (c === quote) { advance(); break; }
      if (c === '\\') {
        advance();
        const e = advance();
        const rep = ESCAPES[e];
        if (rep === undefined) { err(`unknown escape sequence \\${e}`); }
        raw += rep ?? ('\\' + e);
        litBuf += rep ?? ('\\' + e);
        continue;
      }
      if (isF && c === '{') {
        if (peek(1) === '{') { advance(); advance(); raw += '{'; litBuf += '{'; continue; }
        advance(); // consume {
        flushLit();
        const exprLine = line;
        let depth = 0;
        let inner = '';
        while (true) {
          if (pos >= len) { err('unterminated f-string expression'); break; }
          const ic = peek();
          if (ic === '}' && depth === 0) { advance(); break; }
          if (ic === '(' || ic === '[' || ic === '{') depth++;
          if (ic === ')' || ic === ']' || ic === '}') depth--;
          inner += advance();
        }
        parts.push({ kind: 'expr', src: inner, line: exprLine });
        continue;
      }
      if (isF && c === '}') {
        if (peek(1) === '}') { advance(); advance(); raw += '}'; litBuf += '}'; continue; }
        err('single "}" not allowed in f-string (use "}}")');
        advance();
        continue;
      }
      raw += advance();
      litBuf += raw[raw.length - 1];
    }
    flushLit();
    return { literal: raw, parts };
  }

  while (pos < len) {
    if (atLineStart && parenDepth === 0) {
      const count = scanIndent();
      if (count === null) continue; // blank/comment line, stay at line start
      applyIndent(count);
      atLineStart = false;
      lineHasTokens = false;
      continue;
    }
    if (pos >= len) break;
    const c = peek();

    if (c === ' ' || c === '\t') { advance(); continue; }
    if (c === '#') { while (pos < len && peek() !== '\n') advance(); continue; }

    if (c === '\n') {
      advance();
      if (parenDepth > 0) continue; // implicit join
      if (lineHasTokens) tokens.push(new Token(T.NEWLINE, null, line - 1, col));
      lineHasTokens = false;
      atLineStart = true;
      continue;
    }

    const startLine = line, startCol = col;

    if (isIdentStart(c)) {
      let s = '';
      while (pos < len && isIdentPart(peek())) s += advance();
      if ((s === 'f' || s === 'F') && (peek() === '"' || peek() === "'")) {
        const quote = advance();
        const { parts } = scanStringBody(quote, true);
        tokens.push(new Token(T.FSTRING, parts, startLine, startCol));
      } else if (KEYWORDS.has(s)) {
        tokens.push(new Token(T.KEYWORD, s, startLine, startCol));
      } else {
        tokens.push(new Token(T.IDENT, s, startLine, startCol));
      }
      lineHasTokens = true;
      continue;
    }

    if (isDigit(c)) { scanNumber(); lineHasTokens = true; continue; }

    if (c === '"' || c === "'") {
      const quote = advance();
      const { literal } = scanStringBody(quote, false);
      tokens.push(new Token(T.STRING, literal, startLine, startCol));
      lineHasTokens = true;
      continue;
    }

    // punctuation / operators, longest match first
    const two = source.substr(pos, 2);
    const three = source.substr(pos, 3);
    const pushOp = (n, type, val) => { for (let i = 0; i < n; i++) advance(); tokens.push(new Token(type, val ?? type, startLine, startCol)); lineHasTokens = true; };

    if (three === '//=') { pushOp(3, T.DSLASH_EQ); continue; }
    if (two === '**') { pushOp(2, T.DSTAR); continue; }
    if (two === '//') { pushOp(2, T.DSLASH); continue; }
    if (two === '==') { pushOp(2, T.EQ); continue; }
    if (two === '!=') { pushOp(2, T.NE); continue; }
    if (two === '<=') { pushOp(2, T.LE); continue; }
    if (two === '>=') { pushOp(2, T.GE); continue; }
    if (two === '+=') { pushOp(2, T.PLUS_EQ); continue; }
    if (two === '-=') { pushOp(2, T.MINUS_EQ); continue; }
    if (two === '*=') { pushOp(2, T.STAR_EQ); continue; }
    if (two === '/=') { pushOp(2, T.SLASH_EQ); continue; }
    if (two === '%=') { pushOp(2, T.PERCENT_EQ); continue; }
    if (two === '->') { pushOp(2, T.ARROW); continue; }

    const singles = {
      '(': T.LPAREN, ')': T.RPAREN, '[': T.LBRACKET, ']': T.RBRACKET,
      '{': T.LBRACE, '}': T.RBRACE, ',': T.COMMA, ':': T.COLON, '.': T.DOT,
      '+': T.PLUS, '-': T.MINUS, '*': T.STAR, '/': T.SLASH, '%': T.PERCENT,
      '=': T.ASSIGN, '<': T.LT, '>': T.GT,
    };
    if (singles[c]) {
      if (c === '(' || c === '[' || c === '{') parenDepth++;
      if ((c === ')' || c === ']' || c === '}') && parenDepth > 0) parenDepth--;
      pushOp(1, singles[c]);
      continue;
    }

    err(`unexpected character ${JSON.stringify(c)}`);
    advance();
  }

  if (lineHasTokens) tokens.push(new Token(T.NEWLINE, null, line, col));
  while (indentStack.length > 1) { indentStack.pop(); tokens.push(new Token(T.DEDENT, null, line, col)); }
  tokens.push(new Token(T.EOF, null, line, col));

  return { tokens, errors };
}

export { lex, LexError };
