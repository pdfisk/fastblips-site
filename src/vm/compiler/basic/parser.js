// Crumb recursive-descent parser. Implements the grammar of spec section 13.
//
// Two properties the spec demands and this parser keeps:
//
//  1. LL(1) except for one wrinkle (section 13): a line starting with IDENT may
//     be an assignment or a call, both beginning `IDENT "("`. We parse the
//     name and its optional argument list, then branch on whether the next
//     token is `=`.
//  2. Every load error in the file is reported together (section 11), so a
//     syntax error is recorded and the parser resynchronises at the next line
//     or block keyword instead of throwing out of the file.

import { TokenType, describeToken } from './tokens.js';
import { CrumbError, sortErrors } from './diagnostics.js';

/** Thrown internally to unwind to the nearest statement boundary. */
class Panic extends Error {}

/** Keywords the parser resynchronises onto: they carry block structure. */
const SYNC_KEYWORDS = new Set(['end', 'else', 'elseif', 'next']);

const COMPARE_OPS = new Set(['=', '<>', '<', '<=', '>', '>=']);
const MUL_OPS = new Set(['*', '/', '\\']);

export class Parser {
  constructor(tokens, { filename = 'input.crumb' } = {}) {
    this.tokens = tokens;
    this.filename = filename;
    this.pos = 0;
    this.errors = [];
    this.loopStack = [];        // 'For' | 'While', innermost last
    this.procStack = [];        // 'Sub' | 'Function'
    this.hoisted = [];          // procedures found nested inside a body
  }

  // ---------------------------------------------------------------- plumbing

  peek(offset = 0) {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[index];
  }

  advance() {
    const token = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return token;
  }

  atEnd() {
    return this.peek().type === TokenType.EOF;
  }

  isOperator(token, value) {
    return token.type === TokenType.Operator && token.value === value;
  }

  isKeyword(token, canonical) {
    return token.type === TokenType.Keyword && token.lower === canonical.toLowerCase();
  }

  atOperator(value) {
    return this.isOperator(this.peek(), value);
  }

  atKeyword(canonical) {
    return this.isKeyword(this.peek(), canonical);
  }

  matchOperator(value) {
    if (!this.atOperator(value)) return null;
    return this.advance();
  }

  matchKeyword(canonical) {
    if (!this.atKeyword(canonical)) return null;
    return this.advance();
  }

  error(message, token = this.peek()) {
    const key = `${token.line}:${token.column}:${message}`;
    if (this.seen === undefined) this.seen = new Set();
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.errors.push(new CrumbError(message, {
      line: token.line, column: token.column, phase: 'load',
    }));
  }

  /** Records an error and unwinds to the enclosing statement loop. */
  fail(message, token = this.peek()) {
    this.error(message, token);
    throw new Panic(message);
  }

  expectOperator(value, context) {
    if (this.atOperator(value)) return this.advance();
    return this.fail(`expected '${value}'${context ? ` ${context}` : ''}, found ${describeToken(this.peek())}`);
  }

  expectKeyword(canonical, context) {
    if (this.atKeyword(canonical)) return this.advance();
    return this.fail(`expected '${canonical}'${context ? ` ${context}` : ''}, found ${describeToken(this.peek())}`);
  }

  expectIdent(context) {
    if (this.peek().type === TokenType.Ident) return this.advance();
    const token = this.peek();
    if (token.type === TokenType.Keyword) {
      return this.fail(`'${token.canonical}' is a reserved word and cannot be used as a name${context ? ` ${context}` : ''}`);
    }
    return this.fail(`expected a name${context ? ` ${context}` : ''}, found ${describeToken(token)}`);
  }

  /** One statement per line (section 1), so a statement must end at NEWLINE. */
  expectNewline() {
    if (this.peek().type === TokenType.Newline) {
      this.advance();
      return;
    }
    if (this.atEnd()) return;
    this.fail(`expected end of line, found ${describeToken(this.peek())}: Crumb allows one statement per line`);
  }

  skipNewlines() {
    while (this.peek().type === TokenType.Newline) this.advance();
  }

  /** Panic-mode recovery: run to the next line break or block keyword. */
  synchronize() {
    while (!this.atEnd()) {
      const token = this.peek();
      if (token.type === TokenType.Newline) {
        this.advance();
        return;
      }
      if (token.type === TokenType.Keyword && SYNC_KEYWORDS.has(token.lower)) return;
      this.advance();
    }
  }

  // ------------------------------------------------------------------ program

  /** program = { line } */
  parseProgram() {
    const body = [];
    const procedures = [];

    this.skipNewlines();
    while (!this.atEnd()) {
      const before = this.pos;

      if (this.atKeyword('Sub') || this.atKeyword('Function')) {
        const decl = this.parseProcedure();
        if (decl) procedures.push(decl);
      } else {
        try {
          body.push(this.parseStatement());
          this.expectNewline();
        } catch (err) {
          if (!(err instanceof Panic)) throw err;
          this.synchronize();
        }
      }

      if (this.pos === before) this.advance();   // guarantee forward progress
      this.skipNewlines();
    }

    procedures.push(...this.hoisted);
    this.checkDuplicateProcedures(procedures);

    return {
      type: 'Program',
      filename: this.filename,
      body,
      procedures,
    };
  }

  checkDuplicateProcedures(procedures) {
    const seen = new Map();
    for (const proc of procedures) {
      const previous = seen.get(proc.nameLower);
      if (previous) {
        this.error(
          `'${proc.name}' is already declared on line ${previous.line}: procedure names share one namespace`,
          { line: proc.line, column: proc.column },
        );
      } else {
        seen.set(proc.nameLower, proc);
      }
    }
  }

  /**
   * Parses lines until a keyword in `stops` (lowercase) or end of input.
   * Nested procedure declarations are an error but are still parsed, so that
   * their `End Sub` is consumed and the cascade stays short.
   */
  parseBlockBody(stops) {
    const body = [];
    this.skipNewlines();

    while (!this.atEnd()) {
      const token = this.peek();
      if (token.type === TokenType.Keyword && stops.has(token.lower)) break;

      const before = this.pos;

      if (this.atKeyword('Sub') || this.atKeyword('Function')) {
        const open = this.procStack.length > 0 ? this.procStack[this.procStack.length - 1] : null;
        this.error(
          open
            ? `procedures cannot be nested: did you forget 'End ${open.kind}' for '${open.name}' on line ${open.line}?`
            : 'procedures cannot be declared inside a block',
          token,
        );
        const decl = this.parseProcedure();
        if (decl) this.hoisted.push(decl);
      } else {
        try {
          body.push(this.parseStatement());
          this.expectNewline();
        } catch (err) {
          if (!(err instanceof Panic)) throw err;
          this.synchronize();
        }
      }

      if (this.pos === before) this.advance();
      this.skipNewlines();
    }

    return body;
  }

  /**
   * Consumes `End <word>`. Leaves a mismatched `End` in place so the enclosing
   * block gets a chance to close on it instead of cascading.
   */
  closeBlock(word, openToken) {
    if (this.isKeyword(this.peek(), 'End') && this.isKeyword(this.peek(1), word)) {
      this.advance();
      this.advance();
      return true;
    }
    if (this.isKeyword(this.peek(), 'End')) {
      this.error(
        `expected 'End ${word}' to close the '${word}' opened on line ${openToken.line}, found 'End ${this.peek(1).canonical ?? describeToken(this.peek(1))}'`,
      );
      // Swallow the mismatched pair. Leaving it for the enclosing block turns
      // one typo into a five-error cascade; the enclosing block will still
      // report itself as unterminated, which is the useful half.
      this.advance();
      if (this.peek().type === TokenType.Keyword) this.advance();
      return false;
    }
    // Point at the block that was left open, not at end of file.
    this.error(`unterminated '${word}' block: expected 'End ${word}'`, openToken);
    return false;
  }

  // --------------------------------------------------------------- statements

  parseStatement() {
    const token = this.peek();

    if (token.type === TokenType.Keyword) {
      switch (token.lower) {
        case 'dim': return this.parseDim();
        case 'print': return this.parsePrint();
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'exit': return this.parseExit();
        case 'return': return this.parseReturn();
        case 'sub':
        case 'function':
          return this.fail('a procedure cannot be declared here');
        default:
          return this.fail(`${describeToken(token)} cannot start a statement`);
      }
    }

    // Transcript is a built-in name, not a reserved word, but at the start of
    // a statement it takes Print's syntax: `Transcript "x =", x`.
    if (token.type === TokenType.Ident && token.lower === 'transcript') return this.parseTranscript();
    if (token.type === TokenType.Ident) return this.parseAssignOrCall();

    return this.fail(`expected a statement, found ${describeToken(token)}`);
  }

  /** dim-stmt = "Dim" IDENT [ "=" expression | "(" expression ")" ] */
  parseDim() {
    const keyword = this.expectKeyword('Dim');
    const name = this.expectIdent('after \'Dim\'');

    let init = null;
    let size = null;

    if (this.matchOperator('=')) {
      init = this.parseExpression();
    } else if (this.matchOperator('(')) {
      size = this.parseExpression();
      this.expectOperator(')', 'after the array bound');
      if (this.atOperator('=')) {
        this.fail('an array declaration cannot have an initialiser: assign elements after the \'Dim\'');
      }
    }

    return {
      type: 'DimStatement',
      name: name.value,
      nameLower: name.lower,
      init,
      size,
      line: keyword.line,
      column: keyword.column,
    };
  }

  /** print-stmt = "Print" [ expression { "," expression } ] */
  parsePrint() {
    const keyword = this.expectKeyword('Print');
    return { type: 'PrintStatement', args: this.parseOutputList(), line: keyword.line, column: keyword.column };
  }

  /** transcript-stmt = "Transcript" [ expression { "," expression } ] */
  parseTranscript() {
    const name = this.expectIdent();
    return { type: 'TranscriptStatement', args: this.parseOutputList(), line: name.line, column: name.column };
  }

  /** The comma-separated values after Print or Transcript; none at end of line. */
  parseOutputList() {
    const args = [];

    if (this.peek().type !== TokenType.Newline && !this.atEnd()) {
      do {
        args.push(this.parseExpression());
      } while (this.matchOperator(','));
    }
    return args;
  }

  /**
   * assign-stmt = lvalue "=" expression
   * call-stmt   = IDENT "(" [ args ] ")"
   *
   * The section 13 wrinkle: both start `IDENT "("`. Parse the name and any
   * argument list, then branch on `=`.
   */
  parseAssignOrCall() {
    const name = this.expectIdent();
    let args = null;             // null = no parentheses, [] = `()`

    if (this.matchOperator('(')) {
      args = [];
      if (!this.atOperator(')')) {
        do {
          args.push(this.parseExpression());
        } while (this.matchOperator(','));
      }
      this.expectOperator(')', `after the arguments to '${name.value}'`);
    }

    if (this.atOperator('=')) {
      this.advance();
      const value = this.parseExpression();

      let target;
      if (args === null) {
        target = {
          type: 'Variable', name: name.value, nameLower: name.lower,
          line: name.line, column: name.column,
        };
      } else if (args.length === 1) {
        target = {
          type: 'Index', name: name.value, nameLower: name.lower, index: args[0],
          line: name.line, column: name.column,
        };
      } else {
        this.fail(
          args.length === 0
            ? `cannot assign to '${name.value}()': an array element needs exactly one index`
            : `cannot assign to '${name.value}(...)': an array element takes exactly one index, found ${args.length}`,
          name,
        );
      }

      return {
        type: 'AssignStatement', target, value, line: name.line, column: name.column,
      };
    }

    if (args === null) {
      this.fail(
        `expected '=' or an argument list after '${name.value}': a call statement needs parentheses, as in '${name.value}()'`,
        name,
      );
    }

    return {
      type: 'CallStatement',
      call: {
        type: 'Apply', name: name.value, nameLower: name.lower, args,
        line: name.line, column: name.column,
      },
      line: name.line,
      column: name.column,
    };
  }

  /**
   * if-stmt = "If" expression "Then"
   *           ( statement
   *           | NEWLINE body { "ElseIf" expression "Then" NEWLINE body }
   *             [ "Else" NEWLINE body ] "End" "If" )
   */
  parseIf() {
    const keyword = this.expectKeyword('If');
    const condition = this.parseExpression();
    this.expectKeyword('Then', 'after the condition');

    // Single-line form: one statement, no Else, no End If.
    if (this.peek().type !== TokenType.Newline && !this.atEnd()) {
      const statement = this.parseStatement();
      if (this.atKeyword('Else') || this.atKeyword('ElseIf')) {
        this.fail(`the single-line 'If' form takes no '${this.peek().canonical}': use the block form`);
      }
      return {
        type: 'IfStatement',
        branches: [{ condition, body: [statement] }],
        elseBody: null,
        singleLine: true,
        line: keyword.line,
        column: keyword.column,
      };
    }

    const stops = new Set(['elseif', 'else', 'end']);
    const branches = [{ condition, body: this.parseBlockBody(stops) }];

    while (this.atKeyword('ElseIf')) {
      this.advance();
      let branchCondition = null;
      try {
        branchCondition = this.parseExpression();
        this.expectKeyword('Then', 'after the condition');
        this.expectNewline();
      } catch (err) {
        if (!(err instanceof Panic)) throw err;
        this.synchronize();
      }
      branches.push({ condition: branchCondition, body: this.parseBlockBody(stops) });
    }

    let elseBody = null;
    if (this.matchKeyword('Else')) {
      if (this.peek().type !== TokenType.Newline && !this.atEnd()) {
        this.error(`expected end of line after 'Else', found ${describeToken(this.peek())}`);
        this.synchronize();
      }
      elseBody = this.parseBlockBody(new Set(['end']));
    }

    this.closeBlock('If', keyword);

    return {
      type: 'IfStatement',
      branches,
      elseBody,
      singleLine: false,
      line: keyword.line,
      column: keyword.column,
    };
  }

  /** while-stmt = "While" expression NEWLINE body "End" "While" */
  parseWhile() {
    const keyword = this.expectKeyword('While');
    const condition = this.parseExpression();
    this.expectNewline();

    this.loopStack.push('While');
    const body = this.parseBlockBody(new Set(['end']));
    this.loopStack.pop();

    this.closeBlock('While', keyword);

    return {
      type: 'WhileStatement', condition, body, line: keyword.line, column: keyword.column,
    };
  }

  /**
   * for-stmt = "For" IDENT "=" expression "To" expression
   *            [ "Step" expression ] NEWLINE body "Next"
   */
  parseFor() {
    const keyword = this.expectKeyword('For');
    const variable = this.expectIdent('for the loop variable');
    this.expectOperator('=', 'after the loop variable');
    const start = this.parseExpression();
    this.expectKeyword('To', 'after the start value');
    const limit = this.parseExpression();
    const step = this.matchKeyword('Step') ? this.parseExpression() : null;
    this.expectNewline();

    this.loopStack.push('For');
    const body = this.parseBlockBody(new Set(['next', 'end']));
    this.loopStack.pop();

    if (this.matchKeyword('Next')) {
      if (this.peek().type === TokenType.Ident) {
        this.error(`'Next' takes no variable name in Crumb: drop '${this.peek().value}'`);
        this.advance();
      }
    } else if (this.isKeyword(this.peek(), 'End')) {
      this.error(`expected 'Next' to close the 'For' opened on line ${keyword.line}`);
    } else {
      this.error("unterminated 'For' block: expected 'Next'", keyword);
    }

    return {
      type: 'ForStatement',
      variable: variable.value,
      variableLower: variable.lower,
      start,
      limit,
      step,
      body,
      line: keyword.line,
      column: keyword.column,
    };
  }

  /** exit-stmt = "Exit" ( "For" | "While" ) */
  parseExit() {
    const keyword = this.expectKeyword('Exit');
    let kind;
    if (this.matchKeyword('For')) kind = 'For';
    else if (this.matchKeyword('While')) kind = 'While';
    else return this.fail(`expected 'For' or 'While' after 'Exit', found ${describeToken(this.peek())}`);

    if (!this.loopStack.includes(kind)) {
      this.error(`'Exit ${kind}' is not inside a '${kind}' loop`, keyword);
    }

    return { type: 'ExitStatement', kind, line: keyword.line, column: keyword.column };
  }

  /** return-stmt = "Return" [ expression ] */
  parseReturn() {
    const keyword = this.expectKeyword('Return');
    const bare = this.peek().type === TokenType.Newline || this.atEnd();
    const value = bare ? null : this.parseExpression();

    const proc = this.procStack[this.procStack.length - 1];
    if (!proc) {
      this.error("'Return' is only allowed inside a 'Sub' or 'Function'", keyword);
    } else if (proc.kind === 'Function' && bare) {
      this.error(`'Return' in a Function must return a value ('${proc.name}' on line ${proc.line})`, keyword);
    } else if (proc.kind === 'Sub' && !bare) {
      this.error(`a Sub cannot return a value ('${proc.name}' on line ${proc.line})`, keyword);
    }

    return { type: 'ReturnStatement', value, line: keyword.line, column: keyword.column };
  }

  // --------------------------------------------------------------- procedures

  /**
   * sub-decl      = "Sub" IDENT "(" [ params ] ")" NEWLINE body "End" "Sub"
   * function-decl = "Function" IDENT "(" ... ")" NEWLINE body "End" "Function"
   */
  parseProcedure() {
    const keyword = this.advance();                       // Sub | Function
    const kind = keyword.canonical;                       // 'Sub' | 'Function'

    let name;
    const params = [];
    try {
      name = this.expectIdent(`after '${kind}'`);
      this.expectOperator('(', `after the ${kind.toLowerCase()} name`);
      if (!this.atOperator(')')) {
        do {
          const param = this.expectIdent('for a parameter');
          const clash = params.find((p) => p.lower === param.lower);
          if (clash) {
            this.error(`parameter '${param.value}' is already declared on line ${clash.line}`, param);
          }
          params.push(param);
        } while (this.matchOperator(','));
      }
      this.expectOperator(')', 'after the parameter list');
      this.expectNewline();
    } catch (err) {
      if (!(err instanceof Panic)) throw err;
      this.synchronize();
      if (!name) return null;
    }

    // Loops do not cross a procedure boundary.
    const outerLoops = this.loopStack;
    this.loopStack = [];
    this.procStack.push({ kind, name: name.value, line: keyword.line });

    const body = this.parseBlockBody(new Set(['end']));

    this.procStack.pop();
    this.loopStack = outerLoops;

    this.closeBlock(kind, keyword);

    return {
      type: kind === 'Sub' ? 'SubDeclaration' : 'FunctionDeclaration',
      kind,
      name: name.value,
      nameLower: name.lower,
      params: params.map((p) => ({ name: p.value, nameLower: p.lower })),
      body,
      line: keyword.line,
      column: keyword.column,
    };
  }

  // -------------------------------------------------------------- expressions
  // One function per precedence level of section 8, tightest last.

  parseExpression() {
    return this.parseOr();
  }

  /** or-expr = and-expr { "Or" and-expr }  — level 10, left */
  parseOr() {
    let left = this.parseAnd();
    let token;
    while ((token = this.matchKeyword('Or'))) {
      left = this.binary('Or', left, this.parseAnd(), token, { shortCircuit: true });
    }
    return left;
  }

  /** and-expr = not-expr { "And" not-expr }  — level 9, left */
  parseAnd() {
    let left = this.parseNot();
    let token;
    while ((token = this.matchKeyword('And'))) {
      left = this.binary('And', left, this.parseNot(), token, { shortCircuit: true });
    }
    return left;
  }

  /**
   * not-expr = "Not" not-expr | compare-expr  — level 8
   * Note this sits BELOW the comparisons, so `Not x = y` is `Not (x = y)`.
   */
  parseNot() {
    const token = this.matchKeyword('Not');
    if (token) {
      const operand = this.parseNot();
      return {
        type: 'Unary', operator: 'Not', operand, line: token.line, column: token.column,
      };
    }
    return this.parseCompare();
  }

  /** compare-expr = concat-expr { ( "=" | "<>" | ... ) concat-expr }  — level 7, left */
  parseCompare() {
    let left = this.parseConcat();
    while (this.peek().type === TokenType.Operator && COMPARE_OPS.has(this.peek().value)) {
      const token = this.advance();
      left = this.binary(token.value, left, this.parseConcat(), token);
    }
    return left;
  }

  /** concat-expr = add-expr { "&" add-expr }  — level 6, left */
  parseConcat() {
    let left = this.parseAdd();
    let token;
    while ((token = this.matchOperator('&'))) {
      left = this.binary('&', left, this.parseAdd(), token);
    }
    return left;
  }

  /** add-expr = mul-expr { ( "+" | "-" ) mul-expr }  — level 5, left */
  parseAdd() {
    let left = this.parseMul();
    while (this.peek().type === TokenType.Operator
        && (this.peek().value === '+' || this.peek().value === '-')) {
      const token = this.advance();
      left = this.binary(token.value, left, this.parseMul(), token);
    }
    return left;
  }

  /** mul-expr = unary-expr { ( "*" | "/" | "\" | "Mod" ) unary-expr }  — level 4, left */
  parseMul() {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.type === TokenType.Operator && MUL_OPS.has(token.value)) {
        this.advance();
        left = this.binary(token.value, left, this.parseUnary(), token);
      } else if (this.isKeyword(token, 'Mod')) {
        this.advance();
        left = this.binary('Mod', left, this.parseUnary(), token);
      } else {
        return left;
      }
    }
  }

  /** unary-expr = ( "-" | "+" ) unary-expr | power-expr  — level 3, right */
  parseUnary() {
    const token = this.peek();
    if (token.type === TokenType.Operator && (token.value === '-' || token.value === '+')) {
      this.advance();
      const operand = this.parseUnary();
      return {
        type: 'Unary', operator: token.value, operand, line: token.line, column: token.column,
      };
    }
    return this.parsePower();
  }

  /**
   * power-expr = primary [ "^" unary-expr ]  — level 2, right
   * The RHS is a unary-expr, which is what makes `2 ^ -3` legal and
   * `-2 ^ 2` mean `-(2 ^ 2)`.
   */
  parsePower() {
    const base = this.parsePrimary();
    const token = this.matchOperator('^');
    if (!token) return base;
    return this.binary('^', base, this.parseUnary(), token);
  }

  /**
   * primary = NUMBER | STRING | "True" | "False" | "Nothing"
   *         | IDENT [ "(" [ args ] ")" ]
   *         | "(" expression ")"
   */
  parsePrimary() {
    const token = this.peek();

    if (token.type === TokenType.Number) {
      this.advance();
      return {
        type: 'NumberLiteral', value: token.value, text: token.text,
        line: token.line, column: token.column,
      };
    }

    if (token.type === TokenType.String) {
      this.advance();
      return {
        type: 'StringLiteral', value: token.value, line: token.line, column: token.column,
      };
    }

    if (token.type === TokenType.Keyword) {
      if (token.lower === 'true' || token.lower === 'false') {
        this.advance();
        return {
          type: 'BooleanLiteral', value: token.lower === 'true',
          line: token.line, column: token.column,
        };
      }
      if (token.lower === 'nothing') {
        this.advance();
        return { type: 'NothingLiteral', line: token.line, column: token.column };
      }
      return this.fail(`${describeToken(token)} cannot appear in an expression`);
    }

    if (token.type === TokenType.Ident) {
      this.advance();
      if (this.matchOperator('(')) {
        const args = [];
        if (!this.atOperator(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.matchOperator(','));
        }
        this.expectOperator(')', `after the arguments to '${token.value}'`);
        // section 9: one node. Index or call is decided when the name resolves.
        return {
          type: 'Apply', name: token.value, nameLower: token.lower, args,
          line: token.line, column: token.column,
        };
      }
      return {
        type: 'Variable', name: token.value, nameLower: token.lower,
        line: token.line, column: token.column,
      };
    }

    if (this.isOperator(token, '(')) {
      this.advance();
      const inner = this.parseExpression();
      this.expectOperator(')', 'to close the group');
      return inner;
    }

    if (this.isOperator(token, '=')) {
      return this.fail("unexpected '=': Crumb has no assignment inside an expression");
    }

    return this.fail(`expected an expression, found ${describeToken(token)}`);
  }

  binary(operator, left, right, token, extra = {}) {
    return {
      type: 'Binary', operator, left, right, ...extra,
      line: token.line, column: token.column,
    };
  }
}

/**
 * Parses a token stream produced by the lexer.
 * @returns {{ast: object, errors: CrumbError[]}}
 */
export function parseTokens(tokens, options = {}) {
  const parser = new Parser(tokens, options);
  const ast = parser.parseProgram();
  return { ast, errors: sortErrors(parser.errors) };
}
