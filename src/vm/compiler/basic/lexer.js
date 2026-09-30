// Crumb tokenizer. Implements spec section 2.
//
// Never throws on bad input: it records a load error, recovers, and keeps
// scanning, because section 11 requires every load error in a file to be
// reported together.

import { TokenType, KEYWORD_TABLE, OPERATORS, describeToken } from './tokens.js';
import { CrumbError } from './diagnostics.js';

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
// digits [ . digits ] [ (e|E) [+|-] digits ]
const NUMBER_RE = /[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g;

export class Lexer {
  constructor(source, { filename = 'input.crumb' } = {}) {
    this.source = source;
    this.filename = filename;
    this.pos = 0;
    this.line = 1;
    this.lineStart = 0;
    this.tokens = [];
    this.errors = [];
  }

  get column() {
    return this.pos - this.lineStart + 1;
  }

  error(message, line = this.line, column = this.column) {
    this.errors.push(new CrumbError(message, { line, column, phase: 'load' }));
  }

  push(type, fields) {
    this.tokens.push({ type, ...fields });
  }

  /** True when the last token emitted was a NEWLINE (or nothing has been emitted). */
  atFreshLine() {
    if (this.tokens.length === 0) return true;
    return this.tokens[this.tokens.length - 1].type === TokenType.Newline;
  }

  tokenize() {
    const src = this.source;

    while (this.pos < src.length) {
      const ch = src[this.pos];

      // --- horizontal whitespace -------------------------------------------
      if (ch === ' ' || ch === '\t') {
        this.pos += 1;
        continue;
      }

      // --- comment: ' to end of line ---------------------------------------
      if (ch === "'") {
        while (this.pos < src.length && src[this.pos] !== '\n' && src[this.pos] !== '\r') {
          this.pos += 1;
        }
        continue;
      }

      // --- newline ---------------------------------------------------------
      if (ch === '\n' || ch === '\r') {
        const line = this.line;
        const column = this.column;
        if (ch === '\r' && src[this.pos + 1] === '\n') this.pos += 2;
        else this.pos += 1;
        this.line += 1;
        this.lineStart = this.pos;
        // Runs of blank and comment-only lines collapse to one NEWLINE, and a
        // leading run is dropped entirely.
        if (!this.atFreshLine()) {
          this.push(TokenType.Newline, { value: '\n', line, column });
        }
        continue;
      }

      // --- string ----------------------------------------------------------
      if (ch === '"') {
        this.readString();
        continue;
      }

      // --- number ----------------------------------------------------------
      if (DIGIT.test(ch)) {
        this.readNumber();
        continue;
      }

      // --- identifier or keyword -------------------------------------------
      if (IDENT_START.test(ch)) {
        this.readWord();
        continue;
      }

      // --- a leading-dot number: .5 ------------------------------------------
      if (ch === '.' && DIGIT.test(src[this.pos + 1] ?? '')) {
        this.error("unexpected '.': a number needs a digit before the point, as in 0.5", this.line, this.column);
        this.pos += 1;
        continue;
      }

      // --- operator (including '.', member access) ---------------------------
      const op = OPERATORS.find((candidate) => src.startsWith(candidate, this.pos));
      if (op !== undefined) {
        const column = this.column;
        this.pos += op.length;
        this.push(TokenType.Operator, { value: op, line: this.line, column });
        continue;
      }

      // --- anything else ---------------------------------------------------
      const column = this.column;
      if (ch === '$' || ch === '%' || ch === '!' || ch === '#' || ch === '@') {
        this.error(`unexpected '${ch}': type suffixes were removed in v0.1 (see spec section 15)`, this.line, column);
      } else {
        this.error(`unexpected character '${ch}'`, this.line, column);
      }
      this.pos += 1;
    }

    // Terminate the final line so every `line` in the grammar has its NEWLINE,
    // then mark the end of input.
    if (!this.atFreshLine()) {
      this.push(TokenType.Newline, { value: '\n', line: this.line, column: this.column });
    }
    this.push(TokenType.EOF, { value: '', line: this.line, column: this.column });

    return { tokens: this.tokens, errors: this.errors };
  }

  readString() {
    const src = this.source;
    const line = this.line;
    const column = this.column;
    const start = this.pos;
    let value = '';
    this.pos += 1; // opening quote

    for (;;) {
      if (this.pos >= src.length || src[this.pos] === '\n' || src[this.pos] === '\r') {
        this.error('unterminated string literal: a string cannot span lines', line, column);
        this.push(TokenType.String, {
          value, text: src.slice(start, this.pos), line, column, malformed: true,
        });
        return;
      }
      if (src[this.pos] === '"') {
        if (src[this.pos + 1] === '"') {
          value += '"';           // "" is one literal quote
          this.pos += 2;
          continue;
        }
        this.pos += 1;            // closing quote
        break;
      }
      value += src[this.pos];
      this.pos += 1;
    }

    this.push(TokenType.String, { value, text: src.slice(start, this.pos), line, column });
  }

  readNumber() {
    const line = this.line;
    const column = this.column;
    NUMBER_RE.lastIndex = this.pos;
    const match = NUMBER_RE.exec(this.source);
    const text = match[0];
    this.pos += text.length;

    // `1.` and `1e` are scanned as `1` followed by junk; say so plainly.
    const next = this.source[this.pos];
    if (next === '.') {
      this.error(`malformed number '${text}.': a decimal point needs digits on both sides`, line, column);
      this.pos += 1;
    } else if ((next === 'e' || next === 'E') && !IDENT_PART.test(this.source[this.pos + 1] ?? '')) {
      this.error(`malformed number '${text}${next}': an exponent needs digits`, line, column);
      this.pos += 1;
    }

    this.push(TokenType.Number, { value: Number(text), text, line, column });
  }

  readWord() {
    const src = this.source;
    const line = this.line;
    const column = this.column;
    const start = this.pos;
    while (this.pos < src.length && IDENT_PART.test(src[this.pos])) this.pos += 1;
    const word = src.slice(start, this.pos);
    const lower = word.toLowerCase();
    const canonical = KEYWORD_TABLE.get(lower);

    if (canonical !== undefined) {
      this.push(TokenType.Keyword, { value: word, lower, canonical, line, column });
    } else {
      this.push(TokenType.Ident, { value: word, lower, line, column });
    }
  }
}

/**
 * Tokenizes `source`.
 * @returns {{tokens: object[], errors: CrumbError[]}}
 */
export function tokenize(source, options = {}) {
  return new Lexer(source, options).tokenize();
}

export { describeToken };
