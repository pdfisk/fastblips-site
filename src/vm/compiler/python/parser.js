// MiniPy parser: tokens -> AST, with panic-mode error recovery.

import { T } from './tokens.js';
import { lex } from './lexer.js';

class ParseError {
  constructor(message, line) { this.message = message; this.line = line; }
}

const AUG_MAP = {
  [T.PLUS_EQ]: '+', [T.MINUS_EQ]: '-', [T.STAR_EQ]: '*',
  [T.SLASH_EQ]: '/', [T.DSLASH_EQ]: '//', [T.PERCENT_EQ]: '%',
};

class Parser {
  constructor(tokens, errors) {
    this.toks = tokens;
    this.pos = 0;
    this.errors = errors; // shared array, load errors accumulate here
  }

  peek(o = 0) { return this.toks[Math.min(this.pos + o, this.toks.length - 1)]; }
  cur() { return this.peek(); }
  atEnd() { return this.cur().type === T.EOF; }
  advance() { const t = this.cur(); if (!this.atEnd()) this.pos++; return t; }
  check(type, value) {
    const t = this.cur();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
  checkKw(word) { return this.check(T.KEYWORD, word); }
  match(type, value) { if (this.check(type, value)) return this.advance(); return null; }
  matchKw(word) { return this.match(T.KEYWORD, word); }

  expect(type, value, what) {
    if (this.check(type, value)) return this.advance();
    const t = this.cur();
    this.err(`expected ${what || value || type} but found ${t.type === T.KEYWORD ? t.value : t.type}`, t.line);
    return t; // don't advance; caller loop will re-sync
  }

  err(msg, line) { this.errors.push(new ParseError(msg, line ?? this.cur().line)); }

  // panic-mode recovery: skip to the next NEWLINE (or matching DEDENT) so one
  // bad line doesn't cascade into every line after it.
  syncToNewline() {
    while (!this.atEnd() && !this.check(T.NEWLINE) && !this.check(T.DEDENT)) this.advance();
    if (this.check(T.NEWLINE)) this.advance();
  }

  // ---- program ----
  parseModule() {
    const body = [];
    while (!this.atEnd()) {
      if (this.match(T.NEWLINE)) continue;
      const before = this.pos;
      try {
        body.push(this.parseStatement());
      } catch (e) {
        if (e instanceof StopStmt) { this.syncToNewline(); }
        else throw e;
      }
      if (this.pos === before) { this.err(`unexpected token ${this.cur().type}`); this.advance(); }
    }
    return { type: 'Module', body };
  }

  parseBlock() {
    this.expect(T.COLON, undefined, "':'");
    this.expect(T.NEWLINE, undefined, 'newline');
    this.expect(T.INDENT, undefined, 'indented block');
    const body = [];
    while (!this.check(T.DEDENT) && !this.atEnd()) {
      if (this.match(T.NEWLINE)) continue;
      const before = this.pos;
      try { body.push(this.parseStatement()); }
      catch (e) { if (e instanceof StopStmt) this.syncToNewline(); else throw e; }
      if (this.pos === before) { this.err(`unexpected token ${this.cur().type}`); this.advance(); }
    }
    this.expect(T.DEDENT, undefined, 'dedent');
    if (body.length === 0) this.err('block cannot be empty (a real Python program would use pass)');
    return body;
  }

  parseStatement() {
    if (this.checkKw('if')) return this.parseIf();
    if (this.checkKw('while')) return this.parseWhile();
    if (this.checkKw('for')) return this.parseFor();
    if (this.checkKw('def')) return this.parseFuncDef();
    if (this.checkKw('class')) return this.parseClassDef();
    if (this.checkKw('try')) return this.parseTry();
    const stmt = this.parseSimpleStatement();
    this.expect(T.NEWLINE, undefined, 'newline');
    return stmt;
  }

  parseSimpleStatement() {
    const line = this.cur().line;
    if (this.matchKw('pass')) return { type: 'Pass', line };
    if (this.matchKw('break')) return { type: 'Break', line };
    if (this.matchKw('continue')) return { type: 'Continue', line };
    if (this.matchKw('return')) {
      const value = (this.check(T.NEWLINE)) ? null : this.expression();
      return { type: 'Return', value, line };
    }
    if (this.matchKw('raise')) {
      let exc = null, cause = null;
      if (!this.check(T.NEWLINE)) {
        exc = this.expression();
        if (this.matchKw('from')) cause = this.expression();
      }
      return { type: 'Raise', exc, cause, line };
    }
    if (this.matchKw('del')) {
      const target = this.expression();
      this.validateTarget(target);
      return { type: 'Del', target, line };
    }
    return this.parseExprOrAssign();
  }

  // ---- expression / assignment statements ----
  parseExprOrAssign() {
    const line = this.cur().line;
    let first = this.parseCommaList();
    if (this.check(T.PLUS_EQ) || this.check(T.MINUS_EQ) || this.check(T.STAR_EQ) ||
        this.check(T.SLASH_EQ) || this.check(T.DSLASH_EQ) || this.check(T.PERCENT_EQ)) {
      const opTok = this.advance();
      this.validateTarget(first);
      const value = this.parseCommaList();
      return { type: 'AugAssign', target: first, op: AUG_MAP[opTok.type], value, line };
    }
    if (this.check(T.ASSIGN)) {
      const targets = [first];
      let value = null;
      while (this.match(T.ASSIGN)) {
        value = this.parseCommaList();
        if (!this.check(T.ASSIGN)) break;
        targets.push(value);
      }
      for (const t of targets) this.validateTarget(t);
      return { type: 'Assign', targets, value, line };
    }
    return { type: 'ExprStmt', expr: first, line };
  }

  // comma-separated expressions; produces a Tuple node if >1 element or a
  // trailing comma is present, otherwise the bare expression.
  parseCommaList() {
    const line = this.cur().line;
    const first = this.expression();
    if (!this.check(T.COMMA)) return first;
    const elements = [first];
    let trailing = false;
    while (this.match(T.COMMA)) {
      trailing = true;
      if (this.check(T.NEWLINE) || this.check(T.ASSIGN) || this.check(T.COLON) || this.atEnd()) break;
      elements.push(this.expression());
      trailing = false;
    }
    return { type: 'Tuple', elements, line };
  }

  validateTarget(node) {
    if (!node) return;
    if (node.type === 'Name' || node.type === 'Attribute' || node.type === 'Subscript') return;
    if (node.type === 'Tuple' || node.type === 'List') { for (const e of node.elements) this.validateTarget(e); return; }
    this.err(`cannot assign to this expression`, node.line);
  }

  // ---- compound statements ----
  parseIf() {
    const line = this.advance().line; // 'if'
    const cases = [];
    let test = this.expression();
    let body = this.parseBlock();
    cases.push({ test, body });
    while (this.checkKw('elif')) {
      this.advance();
      test = this.expression();
      body = this.parseBlock();
      cases.push({ test, body });
    }
    let orelse = null;
    if (this.matchKw('else')) orelse = this.parseBlock();
    return { type: 'If', cases, orelse, line };
  }

  parseWhile() {
    const line = this.advance().line;
    const test = this.expression();
    const body = this.parseBlock();
    let orelse = null;
    if (this.matchKw('else')) orelse = this.parseBlock();
    return { type: 'While', test, body, orelse, line };
  }

  parseFor() {
    const line = this.advance().line;
    const target = this.parseForTargetList();
    if (!this.matchKw('in')) this.err("expected 'in' in for statement", this.cur().line);
    const iter = this.expression();
    const body = this.parseBlock();
    let orelse = null;
    if (this.matchKw('else')) orelse = this.parseBlock();
    return { type: 'For', target, iter, body, orelse, line };
  }

  // restricted grammar so `in` isn't swallowed as a comparison operator
  parseForTargetAtom() {
    const line = this.cur().line;
    if (this.match(T.LPAREN)) {
      const list = this.parseForTargetList(true);
      this.expect(T.RPAREN, undefined, "')'");
      return list;
    }
    const nameTok = this.expect(T.IDENT, undefined, 'identifier');
    return { type: 'Name', name: nameTok.value, line };
  }
  parseForTargetList() {
    const line = this.cur().line;
    const first = this.parseForTargetAtom();
    if (!this.check(T.COMMA)) return first;
    const elements = [first];
    while (this.match(T.COMMA)) {
      if (this.checkKw('in') || this.check(T.RPAREN)) break;
      elements.push(this.parseForTargetAtom());
    }
    return { type: 'Tuple', elements, line };
  }

  parseFuncDef() {
    const line = this.advance().line;
    const name = this.expect(T.IDENT, undefined, 'function name').value;
    this.expect(T.LPAREN, undefined, "'('");
    const params = [];
    const seen = new Set();
    while (!this.check(T.RPAREN)) {
      const pTok = this.expect(T.IDENT, undefined, 'parameter name');
      if (seen.has(pTok.value)) this.err(`duplicate parameter name '${pTok.value}'`, pTok.line);
      seen.add(pTok.value);
      let def = null;
      if (this.match(T.ASSIGN)) def = this.expression();
      params.push({ name: pTok.value, default: def });
      if (!this.match(T.COMMA)) break;
    }
    this.expect(T.RPAREN, undefined, "')'");
    const body = this.parseBlock();
    return { type: 'FunctionDef', name, params, body, line };
  }

  parseClassDef() {
    const line = this.advance().line;
    const name = this.expect(T.IDENT, undefined, 'class name').value;
    let base = null;
    if (this.match(T.LPAREN)) {
      if (!this.check(T.RPAREN)) base = this.expect(T.IDENT, undefined, 'base class name').value;
      this.expect(T.RPAREN, undefined, "')'");
    }
    const body = this.parseBlock();
    return { type: 'ClassDef', name, base, body, line };
  }

  parseTry() {
    const line = this.advance().line;
    const body = this.parseBlock();
    const handlers = [];
    while (this.checkKw('except')) {
      this.advance();
      let types = null, name = null;
      if (!this.check(T.COLON)) {
        types = this.expression();
        if (this.matchKw('as')) name = this.expect(T.IDENT, undefined, 'name').value;
      }
      const hbody = this.parseBlock();
      handlers.push({ types, name, body: hbody });
    }
    let orelse = null, fin = null;
    if (this.matchKw('else')) orelse = this.parseBlock();
    if (this.matchKw('finally')) fin = this.parseBlock();
    if (handlers.length === 0 && !fin) this.err("'try' must have at least one 'except' or a 'finally'", line);
    return { type: 'Try', body, handlers, orelse, finally: fin, line };
  }

  // ---- expressions, tightest-last per §8 ----
  expression() { return this.orExpr(); }

  orExpr() {
    let left = this.andExpr();
    while (this.matchKw('or')) {
      const right = this.andExpr();
      left = { type: 'BoolOp', op: 'or', left, right, line: left.line };
    }
    return left;
  }
  andExpr() {
    let left = this.notExpr();
    while (this.matchKw('and')) {
      const right = this.notExpr();
      left = { type: 'BoolOp', op: 'and', left, right, line: left.line };
    }
    return left;
  }
  notExpr() {
    if (this.checkKw('not')) {
      const line = this.advance().line;
      return { type: 'Unary', op: 'not', operand: this.notExpr(), line };
    }
    return this.comparisonExpr();
  }
  comparisonExpr() {
    let left = this.addExpr();
    const ops = [], comparators = [];
    for (;;) {
      let op = null;
      if (this.check(T.LT)) { this.advance(); op = '<'; }
      else if (this.check(T.LE)) { this.advance(); op = '<='; }
      else if (this.check(T.GT)) { this.advance(); op = '>'; }
      else if (this.check(T.GE)) { this.advance(); op = '>='; }
      else if (this.check(T.EQ)) { this.advance(); op = '=='; }
      else if (this.check(T.NE)) { this.advance(); op = '!='; }
      else if (this.checkKw('in')) { this.advance(); op = 'in'; }
      else if (this.checkKw('is')) {
        this.advance();
        op = this.matchKw('not') ? 'is not' : 'is';
      }
      else if (this.checkKw('not') && this.peek(1).type === T.KEYWORD && this.peek(1).value === 'in') {
        this.advance(); this.advance(); op = 'not in';
      }
      else break;
      ops.push(op);
      comparators.push(this.addExpr());
    }
    if (ops.length === 0) return left;
    return { type: 'Compare', left, ops, comparators, line: left.line };
  }
  addExpr() {
    let left = this.mulExpr();
    while (this.check(T.PLUS) || this.check(T.MINUS)) {
      const op = this.advance().type === T.PLUS ? '+' : '-';
      const right = this.mulExpr();
      left = { type: 'Binary', op, left, right, line: left.line };
    }
    return left;
  }
  mulExpr() {
    let left = this.unaryExpr();
    while (this.check(T.STAR) || this.check(T.SLASH) || this.check(T.DSLASH) || this.check(T.PERCENT)) {
      const t = this.advance();
      const op = { [T.STAR]: '*', [T.SLASH]: '/', [T.DSLASH]: '//', [T.PERCENT]: '%' }[t.type];
      const right = this.unaryExpr();
      left = { type: 'Binary', op, left, right, line: left.line };
    }
    return left;
  }
  unaryExpr() {
    if (this.check(T.MINUS) || this.check(T.PLUS)) {
      const t = this.advance();
      return { type: 'Unary', op: t.type === T.MINUS ? '-' : '+', operand: this.unaryExpr(), line: t.line };
    }
    return this.powerExpr();
  }
  powerExpr() {
    const base = this.postfixExpr();
    if (this.match(T.DSTAR)) {
      const exp = this.unaryExpr();
      return { type: 'Binary', op: '**', left: base, right: exp, line: base.line };
    }
    return base;
  }
  postfixExpr() {
    let node = this.primary();
    for (;;) {
      if (this.match(T.LPAREN)) {
        const args = [];
        while (!this.check(T.RPAREN)) {
          args.push(this.expression());
          if (!this.match(T.COMMA)) break;
        }
        this.expect(T.RPAREN, undefined, "')'");
        node = { type: 'Call', func: node, args, line: node.line };
      } else if (this.match(T.LBRACKET)) {
        node = this.parseSubscript(node);
      } else if (this.match(T.DOT)) {
        const name = this.expect(T.IDENT, undefined, 'attribute name').value;
        node = { type: 'Attribute', obj: node, name, line: node.line };
      } else break;
    }
    return node;
  }

  parseSubscript(obj) {
    const line = obj.line;
    let start = null, stop = null, step = null, isSlice = false;
    if (!this.check(T.COLON)) start = this.expression();
    if (this.match(T.COLON)) {
      isSlice = true;
      if (!this.check(T.COLON) && !this.check(T.RBRACKET)) stop = this.expression();
      if (this.match(T.COLON)) {
        if (!this.check(T.RBRACKET)) step = this.expression();
      }
    }
    this.expect(T.RBRACKET, undefined, "']'");
    if (isSlice) return { type: 'Slice', obj, start, stop, step, line };
    return { type: 'Subscript', obj, index: start, line };
  }

  primary() {
    const t = this.cur();
    if (t.type === T.NUMBER) { this.advance(); return { type: 'Num', value: t.value.value, text: t.value.text, isFloat: t.value.isFloat, line: t.line }; }
    if (t.type === T.STRING) { this.advance(); return { type: 'Str', value: t.value, line: t.line }; }
    if (t.type === T.FSTRING) {
      this.advance();
      const parts = t.value.map(p => p.kind === 'lit' ? p : { kind: 'expr', node: parseSubExpression(p.src, p.line, this.errors) });
      return { type: 'FStr', parts, line: t.line };
    }
    if (t.type === T.KEYWORD && t.value === 'True') { this.advance(); return { type: 'NameConst', value: true, line: t.line }; }
    if (t.type === T.KEYWORD && t.value === 'False') { this.advance(); return { type: 'NameConst', value: false, line: t.line }; }
    if (t.type === T.KEYWORD && t.value === 'None') { this.advance(); return { type: 'NameConst', value: null, line: t.line }; }
    if (t.type === T.IDENT) { this.advance(); return { type: 'Name', name: t.value, line: t.line }; }
    if (t.type === T.LPAREN) {
      this.advance();
      if (this.match(T.RPAREN)) return { type: 'Tuple', elements: [], line: t.line };
      const first = this.expression();
      if (this.check(T.COMMA)) {
        const elements = [first];
        while (this.match(T.COMMA)) {
          if (this.check(T.RPAREN)) break;
          elements.push(this.expression());
        }
        this.expect(T.RPAREN, undefined, "')'");
        return { type: 'Tuple', elements, line: t.line };
      }
      this.expect(T.RPAREN, undefined, "')'");
      return first;
    }
    if (t.type === T.LBRACKET) {
      this.advance();
      if (this.match(T.RBRACKET)) return { type: 'List', elements: [], line: t.line };
      const first = this.expression();
      if (this.checkKw('for')) {
        this.advance();
        const target = this.parseForTargetList();
        if (!this.matchKw('in')) this.err("expected 'in' in comprehension", this.cur().line);
        const iter = this.expression();
        let cond = null;
        if (this.matchKw('if')) cond = this.expression();
        this.expect(T.RBRACKET, undefined, "']'");
        return { type: 'ListComp', elt: first, target, iter, cond, line: t.line };
      }
      const elements = [first];
      while (this.match(T.COMMA)) {
        if (this.check(T.RBRACKET)) break;
        elements.push(this.expression());
      }
      this.expect(T.RBRACKET, undefined, "']'");
      return { type: 'List', elements, line: t.line };
    }
    if (t.type === T.LBRACE) {
      this.advance();
      const keys = [], values = [];
      if (!this.check(T.RBRACE)) {
        for (;;) {
          const k = this.expression();
          this.expect(T.COLON, undefined, "':'");
          const v = this.expression();
          keys.push(k); values.push(v);
          if (!this.match(T.COMMA)) break;
          if (this.check(T.RBRACE)) break;
        }
      }
      this.expect(T.RBRACE, undefined, "'}'");
      return { type: 'Dict', keys, values, line: t.line };
    }
    this.err(`unexpected token ${t.type === T.KEYWORD ? t.value : t.type} in expression`, t.line);
    throw new StopStmt();
  }
}

class StopStmt {}

// Used for f-string {expr} segments: lex+parse just that fragment as a
// standalone expression, offsetting reported line numbers to the parent.
function parseSubExpression(src, line, errorsSink) {
  const { tokens, errors } = lex(src + '\n');
  for (const e of errors) errorsSink.push(new ParseError(e.message, line));
  const p = new Parser(tokens, []);
  const localErrors = [];
  p.errors = localErrors;
  let node;
  try { node = p.expression(); }
  catch (e) { for (const le of localErrors) errorsSink.push(new ParseError(le.message, line)); return { type: 'Str', value: '', line }; }
  for (const le of localErrors) errorsSink.push(new ParseError(le.message, line));
  fixLines(node, line);
  return node;
}
function fixLines(node, line) {
  if (!node || typeof node !== 'object') return;
  if ('line' in node) node.line = line;
  for (const k in node) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => fixLines(x, line));
    else if (v && typeof v === 'object') fixLines(v, line);
  }
}

function parseSource(source) {
  const { tokens, errors: lexErrors } = lex(source);
  const errors = [...lexErrors];
  const parser = new Parser(tokens, errors);
  const module = parser.parseModule();
  return { module, errors };
}

export { ParseError, Parser, parseSource, parseSubExpression };
