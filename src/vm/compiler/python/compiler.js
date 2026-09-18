// MiniPy compiler: AST -> bytecode for the shared instruction set
// (src/vm/opcodes.js). Also the scope resolver.
//
// What it shares with the Crumb compiler, and how:
//
//   - Variables live in slots. Module names get global slots at compile time
//     (built-in names first, so the chunk can start them holding the
//     built-ins). A name nothing has assigned yet holds UNBOUND, and reading
//     it is a NameError: the core GET_GLOBAL / GET_LOCAL opcodes check that.
//   - Procedure bodies are appended after the module code, as Crumb's are, so
//     each procedure is one contiguous run of code.
//   - Conditions go through the core JUMP_IF_FALSE, which needs a Boolean:
//     TRUTHY converts first, unless the expression is already a Boolean
//     (a comparison, `not`, True/False).
//   - `not` is TRUTHY + the core NOT.
//   - print(...) with the built-in `print` compiles to the core PRINT with the
//     MiniPy formatter.
//
// Everything with Python's own value rules uses the python section.

import {
  Op, FORMAT, PY_BINARY_OPS, PY_COMPARE_OPS,
} from '../../opcodes.js';
import { UNBOUND } from '../../values.js';
import { BUILTIN_NAMES, createPythonRuntime } from '../../runtime/python-builtins.js';

export class CompileError {
  constructor(message, line) { this.message = message; this.line = line; }
}

/** A function body, a class body, or the module. */
export class Proc {
  constructor(kind, name, params = []) {
    this.kind = kind;             // 'module' | 'function' | 'class'
    this.name = name;
    this.arity = params.length;
    this.locals = new Map();      // name -> slot (unused for the module)
    this.slotNames = [];          // slot -> name
    this.entry = -1;
    this.line = 0;
    for (const p of params) this.declare(p);
  }

  declare(name) {
    if (this.kind === 'module') return null;
    if (!this.locals.has(name)) {
      this.locals.set(name, this.slotNames.length);
      this.slotNames.push(name);
    }
    return this.locals.get(name);
  }
}

/**
 * Every name that Python's scoping rule makes local to a body: any
 * assignment target anywhere in it, not descending into nested def/class.
 */
export function collectLocals(stmts, proc) {
  const target = (node) => {
    if (!node) return;
    if (node.type === 'Name') proc.declare(node.name);
    else if (node.type === 'Tuple' || node.type === 'List') node.elements.forEach(target);
  };
  const visit = (list) => list.forEach(statement);
  function statement(s) {
    switch (s.type) {
      case 'Assign': s.targets.forEach(target); break;
      case 'AugAssign': if (s.target.type === 'Name') proc.declare(s.target.name); break;
      case 'For': target(s.target); visit(s.body); if (s.orelse) visit(s.orelse); break;
      case 'While': visit(s.body); if (s.orelse) visit(s.orelse); break;
      case 'If': s.cases.forEach((c) => visit(c.body)); if (s.orelse) visit(s.orelse); break;
      case 'Try':
        visit(s.body);
        s.handlers.forEach((h) => { if (h.name) proc.declare(h.name); visit(h.body); });
        if (s.orelse) visit(s.orelse);
        if (s.finally) visit(s.finally);
        break;
      case 'FunctionDef': case 'ClassDef': proc.declare(s.name); break;
      default: break;
    }
  }
  visit(stmts);
}

/** Expressions whose value is always a Boolean, so a condition needs no TRUTHY. */
function isBoolean(e) {
  if (e.type === 'Compare') return true;
  if (e.type === 'Unary' && e.op === 'not') return true;
  if (e.type === 'NameConst') return typeof e.value === 'boolean';
  if (e.type === 'BoolOp') return isBoolean(e.left) && isBoolean(e.right);
  return false;
}

export class Compiler {
  constructor({ filename = '<program>' } = {}) {
    this.filename = filename;
    this.code = [];
    this.lines = [];
    this.constants = [];
    this.constantIndex = new Map();
    this.procedures = [];         // everything but the module
    this.errors = [];
    this.line = 1;

    this.globals = new Map();     // name -> slot
    this.globalNames = [];
    for (const name of BUILTIN_NAMES) this.globalSlot(name);

    this.pending = [];            // bodies waiting to be compiled: { proc, body }
    this.tempCounter = 0;
  }

  // ------------------------------------------------------------------ emitting

  err(message, line) { this.errors.push(new CompileError(message, line ?? this.line)); }

  emit(op, ...operands) {
    const at = this.code.length;
    this.code.push(op, ...operands);
    while (this.lines.length < this.code.length) this.lines.push(this.line);
    return at;
  }

  /** Emits an instruction whose last operand is a jump target; returns that
   *  operand's address for patch(). */
  emitJump(op, ...operands) {
    this.emit(op, ...operands, 0);
    return this.code.length - 1;
  }

  patch(address, target = this.code.length) { this.code[address] = target; }

  here() { return this.code.length; }

  constant(value) {
    const key = `${typeof value}:${value}`;
    if (this.constantIndex.has(key)) return this.constantIndex.get(key);
    const index = this.constants.length;
    this.constants.push(value);
    this.constantIndex.set(key, index);
    return index;
  }

  // -------------------------------------------------------------------- names

  globalSlot(name) {
    if (!this.globals.has(name)) {
      this.globals.set(name, this.globalNames.length);
      this.globalNames.push(name);
    }
    return this.globals.get(name);
  }

  resolve(name) {
    if (this.proc.kind !== 'module' && this.proc.locals.has(name)) {
      return { local: true, slot: this.proc.locals.get(name) };
    }
    return { local: false, slot: this.globalSlot(name) };
  }

  load(name) {
    const ref = this.resolve(name);
    this.emit(ref.local ? Op.GET_LOCAL : Op.GET_GLOBAL, ref.slot);
  }

  store(name) {
    const ref = this.resolve(name);
    this.emit(ref.local ? Op.SET_LOCAL : Op.SET_GLOBAL, ref.slot);
  }

  /** A compiler-owned variable the program cannot name. */
  temp() {
    this.tempCounter += 1;
    const name = `$t${this.tempCounter}`;
    if (this.proc.kind !== 'module') this.proc.declare(name);
    return name;
  }

  // ------------------------------------------------------------------ program

  compileModule(ast) {
    const module = new Proc('module', '<module>');
    this.moduleAssigned = new Set();
    collectLocals(ast.body, { declare: (n) => this.moduleAssigned.add(n) });

    this.enterBody(module);
    this.statements(ast.body);
    this.emit(Op.HALT);

    // Procedure bodies follow the module code, in the order they were met;
    // compiling one may queue more (a def inside a def).
    while (this.pending.length > 0) {
      const { proc, body } = this.pending.shift();
      this.enterBody(proc);
      this.line = proc.line;
      proc.entry = this.here();
      this.statements(body);
      this.emit(Op.RETURN_NOTHING);
    }

    const runtime = createPythonRuntime();
    return {
      language: 'python',
      filename: this.filename,
      code: this.code,
      lines: this.lines,
      constants: this.constants,
      globalCount: this.globalNames.length,
      globalNames: this.globalNames,
      globalInit: this.globalNames.map((name) => (runtime.globals.has(name) ? runtime.globals.get(name) : UNBOUND)),
      initialSlot: UNBOUND,
      procedures: this.procedures.map((p) => ({
        name: p.name,
        kind: p.kind,
        arity: p.arity,
        entry: p.entry,
        slotCount: p.slotNames.length,
        slotNames: p.slotNames,
        line: p.line,
      })),
      entry: 0,
      runtime,
    };
  }

  enterBody(proc) {
    this.proc = proc;
    this.loops = [];      // { continueAddr, breaks, isFor, tryDepth }
    this.trys = [];       // 'except' | 'finally', innermost last
  }

  // --------------------------------------------------------------- statements

  statements(list) { for (const s of list) this.statement(s); }

  statement(s) {
    this.line = s.line ?? this.line;
    switch (s.type) {
      case 'ExprStmt':
        if (this.isBuiltinPrint(s.expr)) { this.print(s.expr); break; }
        this.expression(s.expr);
        this.emit(Op.POP);
        break;
      case 'Assign': this.assign(s); break;
      case 'AugAssign': this.augAssign(s); break;
      case 'Pass': break;
      case 'Break': this.breakOrContinue(s, true); break;
      case 'Continue': this.breakOrContinue(s, false); break;
      case 'Return': this.returnStatement(s); break;
      case 'Raise': this.raiseStatement(s); break;
      case 'Del': this.del(s); break;
      case 'If': this.ifStatement(s); break;
      case 'While': this.whileStatement(s); break;
      case 'For': this.forStatement(s); break;
      case 'Try': this.tryStatement(s); break;
      case 'FunctionDef': this.functionDef(s); break;
      case 'ClassDef': this.classDef(s); break;
      default: this.err(`compiler: unhandled statement ${s.type}`, s.line);
    }
  }

  /** Stores the value on top of the stack into an assignment target. */
  storeTo(target) {
    this.line = target.line ?? this.line;
    if (target.type === 'Name') {
      this.store(target.name);
    } else if (target.type === 'Attribute') {
      const value = this.temp();
      this.store(value);
      this.expression(target.obj);
      this.load(value);
      this.emit(Op.SET_ATTR, this.constant(target.name));
    } else if (target.type === 'Subscript') {
      const value = this.temp();
      this.store(value);
      this.expression(target.obj);
      this.expression(target.index);
      this.load(value);
      this.emit(Op.SET_ITEM);
    } else if (target.type === 'Tuple' || target.type === 'List') {
      this.emit(Op.UNPACK_SEQUENCE, target.elements.length);
      for (const element of target.elements) this.storeTo(element);
    } else {
      this.err('cannot assign to this expression', target.line);
    }
  }

  assign(s) {
    this.expression(s.value);
    s.targets.forEach((target, i) => {
      if (i < s.targets.length - 1) this.emit(Op.DUP);
      this.storeTo(target);
    });
  }

  augAssign(s) {
    const op = PY_BINARY_OPS[s.op];
    const t = s.target;
    if (t.type === 'Name') {
      this.expression(t);
      this.expression(s.value);
      this.emit(op);
      this.storeTo(t);
    } else if (t.type === 'Attribute') {
      const obj = this.temp();
      this.expression(t.obj);
      this.store(obj);
      this.load(obj);
      this.emit(Op.GET_ATTR, this.constant(t.name));
      this.expression(s.value);
      this.emit(op);
      const value = this.temp();
      this.store(value);
      this.load(obj);
      this.load(value);
      this.emit(Op.SET_ATTR, this.constant(t.name));
    } else if (t.type === 'Subscript') {
      const obj = this.temp();
      const idx = this.temp();
      this.expression(t.obj);
      this.store(obj);
      this.expression(t.index);
      this.store(idx);
      this.load(obj);
      this.load(idx);
      this.emit(Op.GET_ITEM);
      this.expression(s.value);
      this.emit(op);
      const value = this.temp();
      this.store(value);
      this.load(obj);
      this.load(idx);
      this.load(value);
      this.emit(Op.SET_ITEM);
    } else {
      this.err('cannot assign to this expression', s.line);
    }
  }

  returnStatement(s) {
    if (this.proc.kind !== 'function') {
      this.err("'return' outside function", s.line);
      return;
    }
    if (s.value) {
      this.expression(s.value);
      this.emit(Op.RETURN);
    } else {
      this.emit(Op.RETURN_NOTHING);
    }
  }

  raiseStatement(s) {
    if (s.exc) {
      this.expression(s.exc);
      this.emit(Op.RAISE, 1);
    } else {
      this.emit(Op.RAISE, 0);
    }
  }

  del(s) {
    const t = s.target;
    if (t.type === 'Subscript') {
      this.expression(t.obj);
      this.expression(t.index);
      this.emit(Op.DEL_ITEM);
    } else {
      this.err("'del' target must be a subscript (e.g. 'del d[k]')", s.line);
    }
  }

  /** Leaves a Boolean on the stack for JUMP_IF_FALSE. */
  condition(e) {
    this.expression(e);
    if (!isBoolean(e)) this.emit(Op.TRUTHY);
  }

  ifStatement(s) {
    const ends = [];
    for (const c of s.cases) {
      this.line = c.test.line ?? this.line;
      this.condition(c.test);
      const skip = this.emitJump(Op.JUMP_IF_FALSE);
      this.statements(c.body);
      ends.push(this.emitJump(Op.JUMP));
      this.patch(skip);
    }
    if (s.orelse) this.statements(s.orelse);
    for (const j of ends) this.patch(j);
  }

  whileStatement(s) {
    const top = this.here();
    this.condition(s.test);
    const exit = this.emitJump(Op.JUMP_IF_FALSE);
    this.loops.push({ continueAddr: top, breaks: [], isFor: false, tryDepth: this.trys.length });
    this.statements(s.body);
    const loop = this.loops.pop();
    this.line = s.line;
    this.emit(Op.JUMP, top);
    this.patch(exit);
    if (s.orelse) this.statements(s.orelse);
    for (const j of loop.breaks) this.patch(j);
  }

  forStatement(s) {
    this.expression(s.iter);
    this.emit(Op.GET_ITER);
    const top = this.here();
    const exhausted = this.emitJump(Op.FOR_ITER);
    this.storeTo(s.target);
    this.loops.push({ continueAddr: top, breaks: [], isFor: true, tryDepth: this.trys.length });
    this.statements(s.body);
    const loop = this.loops.pop();
    this.line = s.line;
    this.emit(Op.JUMP, top);
    this.patch(exhausted);          // FOR_ITER has already popped the iterator
    if (s.orelse) this.statements(s.orelse);
    for (const j of loop.breaks) this.patch(j);
  }

  breakOrContinue(s, isBreak) {
    const word = isBreak ? 'break' : 'continue';
    const loop = this.loops[this.loops.length - 1];
    if (!loop) { this.err(`'${word}' outside loop`, s.line); return; }
    // Leaving try blocks opened inside the loop: drop their handlers.
    for (let i = this.trys.length - 1; i >= loop.tryDepth; i -= 1) {
      if (this.trys[i] === 'finally') {
        this.err(`'${word}' out of a 'try' with a 'finally' is not supported`, s.line);
        return;
      }
      this.emit(Op.POP_EXCEPT);
    }
    if (isBreak) {
      if (loop.isFor) this.emit(Op.POP);           // the live iterator
      loop.breaks.push(this.emitJump(Op.JUMP));
    } else {
      this.emit(Op.JUMP, loop.continueAddr);
    }
  }

  tryStatement(s) {
    const hasFinally = !!s.finally;
    const hasExcept = s.handlers.length > 0;

    let finallyAt = null;
    if (hasFinally) { finallyAt = this.emitJump(Op.SETUP_FINALLY); this.trys.push('finally'); }
    let exceptAt = null;
    if (hasExcept) { exceptAt = this.emitJump(Op.SETUP_EXCEPT); this.trys.push('except'); }

    this.statements(s.body);

    if (hasExcept) { this.line = s.line; this.emit(Op.POP_EXCEPT); this.trys.pop(); }
    if (s.orelse) this.statements(s.orelse);

    if (hasExcept) {
      this.line = s.line;
      const skip = this.emitJump(Op.JUMP);
      this.patch(exceptAt);
      // The exception is on the stack. Each handler tests it in turn.
      const ends = [];
      for (const h of s.handlers) {
        let n = 0;
        if (h.types) {
          const types = h.types.type === 'Tuple' ? h.types.elements : [h.types];
          n = types.length;
          for (const t of types) this.expression(t);
        }
        this.line = h.types?.line ?? s.line;
        const noMatch = this.emitJump(Op.MATCH_EXCEPT, n);
        if (h.name) this.store(h.name); else this.emit(Op.POP);
        this.statements(h.body);
        this.line = s.line;
        this.emit(Op.END_EXCEPT);
        ends.push(this.emitJump(Op.JUMP));
        this.patch(noMatch);
      }
      // No handler matched: drop the exception and re-raise it.
      this.emit(Op.POP);
      this.emit(Op.RAISE, 0);
      for (const j of ends) this.patch(j);
      this.patch(skip);
    }

    if (hasFinally) {
      this.trys.pop();
      this.line = s.line;
      this.emit(Op.POP_FINALLY);
      this.patch(finallyAt);
      this.statements(s.finally);
      this.emit(Op.END_FINALLY);
    }
  }

  // -------------------------------------------------------- functions, classes

  functionDef(s) {
    const proc = new Proc('function', s.name, s.params.map((p) => p.name));
    proc.line = s.line;
    collectLocals(s.body, proc);
    const index = this.procedures.length;
    this.procedures.push(proc);
    this.pending.push({ proc, body: s.body });

    // Defaults are evaluated now, in the defining scope.
    const defaults = s.params.filter((p) => p.default);
    for (const p of defaults) this.expression(p.default);
    this.line = s.line;
    this.emit(Op.MAKE_FUNCTION, index, defaults.length);
    this.store(s.name);
  }

  classDef(s) {
    if (s.base) this.load(s.base);
    else this.emit(Op.NOTHING);
    const proc = new Proc('class', s.name);
    proc.line = s.line;
    collectLocals(s.body, proc);
    const index = this.procedures.length;
    this.procedures.push(proc);
    this.pending.push({ proc, body: s.body });
    this.line = s.line;
    this.emit(Op.MAKE_CLASS, index, this.constant(s.name));
    this.store(s.name);
  }

  // -------------------------------------------------------------- expressions

  expression(e) {
    this.line = e.line ?? this.line;
    switch (e.type) {
      case 'Num':
        this.emit(Op.CONST, this.constant(e.isFloat ? Number(e.value) : BigInt(e.text ?? e.value)));
        break;
      case 'Str': this.emit(Op.CONST, this.constant(e.value)); break;
      case 'NameConst':
        if (e.value === true) this.emit(Op.TRUE);
        else if (e.value === false) this.emit(Op.FALSE);
        else this.emit(Op.NOTHING);
        break;
      case 'FStr': this.fstring(e); break;
      case 'Name': this.load(e.name); break;
      case 'List':
        for (const el of e.elements) this.expression(el);
        this.emit(Op.BUILD_LIST, e.elements.length);
        break;
      case 'Tuple':
        for (const el of e.elements) this.expression(el);
        this.emit(Op.BUILD_TUPLE, e.elements.length);
        break;
      case 'Dict':
        for (let i = 0; i < e.keys.length; i += 1) { this.expression(e.keys[i]); this.expression(e.values[i]); }
        this.emit(Op.BUILD_DICT, e.keys.length);
        break;
      case 'ListComp': this.listComp(e); break;
      case 'Unary': this.unary(e); break;
      case 'BoolOp': this.boolOp(e); break;
      case 'Binary':
        this.expression(e.left);
        this.expression(e.right);
        this.line = e.line;
        this.emit(PY_BINARY_OPS[e.op]);
        break;
      case 'Compare': this.compare(e); break;
      case 'Call':
        if (this.isBuiltinPrint(e)) { this.print(e); this.emit(Op.NOTHING); break; }
        this.expression(e.func);
        for (const a of e.args) this.expression(a);
        this.line = e.line;
        this.emit(Op.CALL_VALUE, e.args.length);
        break;
      case 'Attribute':
        this.expression(e.obj);
        this.emit(Op.GET_ATTR, this.constant(e.name));
        break;
      case 'Subscript':
        this.expression(e.obj);
        this.expression(e.index);
        this.line = e.line;
        this.emit(Op.GET_ITEM);
        break;
      case 'Slice':
        this.expression(e.obj);
        for (const part of [e.start, e.stop, e.step]) {
          if (part) this.expression(part); else this.emit(Op.NOTHING);
        }
        this.line = e.line;
        this.emit(Op.GET_SLICE);
        break;
      default:
        this.err(`compiler: unhandled expression ${e.type}`, e.line);
        this.emit(Op.NOTHING);
    }
  }

  /** A call of the built-in print: the name is not rebound anywhere in reach. */
  isBuiltinPrint(e) {
    if (e.type !== 'Call' || e.func.type !== 'Name' || e.func.name !== 'print') return false;
    if (this.proc.kind !== 'module' && this.proc.locals.has('print')) return false;
    return !this.moduleAssigned.has('print');
  }

  print(call) {
    for (const a of call.args) this.expression(a);
    this.line = call.line;
    this.emit(Op.PRINT, call.args.length, FORMAT.PYTHON);
  }

  unary(e) {
    this.expression(e.operand);
    this.line = e.line;
    if (e.op === 'not') {
      if (!isBoolean(e.operand)) this.emit(Op.TRUTHY);
      this.emit(Op.NOT);
    } else if (e.op === '-') {
      this.emit(Op.PY_NEG);
    } else {
      this.emit(Op.PY_POS);
    }
  }

  fstring(e) {
    if (e.parts.length === 0) { this.emit(Op.CONST, this.constant('')); return; }
    e.parts.forEach((p, i) => {
      if (p.kind === 'lit') this.emit(Op.CONST, this.constant(p.value));
      else { this.expression(p.node); this.emit(Op.PY_STR); }
      if (i > 0) this.emit(Op.PY_ADD);
    });
  }

  boolOp(e) {
    this.expression(e.left);
    const jump = this.emitJump(e.op === 'and' ? Op.JUMP_IF_FALSY_KEEP : Op.JUMP_IF_TRUTHY_KEEP);
    this.expression(e.right);
    this.patch(jump);
  }

  compare(e) {
    if (e.ops.length === 1) {
      this.expression(e.left);
      this.expression(e.comparators[0]);
      this.line = e.line;
      this.emit(PY_COMPARE_OPS[e.ops[0]]);
      return;
    }
    // a < b < c is (a < b) and (b < c), each operand evaluated once.
    let left = this.temp();
    this.expression(e.left);
    this.store(left);
    const failed = [];
    e.ops.forEach((op, i) => {
      const last = i === e.ops.length - 1;
      this.load(left);
      this.expression(e.comparators[i]);
      let right = null;
      if (!last) {
        right = this.temp();
        this.emit(Op.DUP);
        this.store(right);
      }
      this.line = e.line;
      this.emit(PY_COMPARE_OPS[op]);
      if (!last) {
        failed.push(this.emitJump(Op.JUMP_IF_FALSE));
        left = right;
      }
    });
    const done = this.emitJump(Op.JUMP);
    for (const j of failed) this.patch(j);
    this.emit(Op.FALSE);
    this.patch(done);
  }

  listComp(e) {
    // The comprehension variable is local to the enclosing function.
    const bind = (t) => {
      if (t.type === 'Name') this.proc.declare(t.name);
      else if (t.type === 'Tuple' || t.type === 'List') t.elements.forEach(bind);
    };
    bind(e.target);
    this.emit(Op.BUILD_LIST, 0);
    this.expression(e.iter);
    this.emit(Op.GET_ITER);
    const top = this.here();
    const exhausted = this.emitJump(Op.FOR_ITER);
    this.storeTo(e.target);
    let skip = null;
    if (e.cond) {
      this.condition(e.cond);
      skip = this.emitJump(Op.JUMP_IF_FALSE);
    }
    this.expression(e.elt);
    this.emit(Op.LIST_APPEND);
    if (skip !== null) this.patch(skip);
    this.emit(Op.JUMP, top);
    this.patch(exhausted);
  }
}

/**
 * Compiles a parsed module.
 * @returns {{chunk: object, errors: CompileError[]}}
 */
export function compileAst(ast, options = {}) {
  const compiler = new Compiler(options);
  const chunk = compiler.compileModule(ast);
  return { chunk, errors: compiler.errors };
}
