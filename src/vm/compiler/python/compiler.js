// MiniPy compiler: AST -> bytecode. Also the scope resolver.

import { OP } from './opcodes.js';
import { mkFloat } from './values.js';

class CompileError {
  constructor(message, line) { this.message = message; this.line = line; }
}

// One entry per user-defined function / class-body / the module itself.
class Proc {
  constructor(kind, name, arity, paramNames) {
    this.kind = kind;             // 'module' | 'function' | 'class-body'
    this.name = name;
    this.arity = arity;
    this.paramNames = paramNames || [];
    this.locals = new Map();      // name -> slot   (empty & unused for 'module')
    this.localNames = [];         // slot -> name   (only meaningful for class-body harvesting)
    this.entry = -1;              // filled in once compiled
    this.line = 0;
  }
  declare(name) {
    if (this.kind === 'module') return null;
    if (!this.locals.has(name)) {
      this.locals.set(name, this.localNames.length);
      this.localNames.push(name);
    }
    return this.locals.get(name);
  }
}

// Collect every name that Python's scoping rule would make local to this
// function/class-body: any assignment target anywhere in the body, not
// descending into nested def/class (those get their own Proc).
function collectLocals(stmts, proc) {
  const visitTarget = (node) => {
    if (!node) return;
    if (node.type === 'Name') proc.declare(node.name);
    else if (node.type === 'Tuple' || node.type === 'List') node.elements.forEach(visitTarget);
    // Attribute / Subscript targets don't bind a new name.
  };
  const visitStmts = (list) => list.forEach(visitStmt);
  const visitStmt = (s) => {
    switch (s.type) {
      case 'Assign': s.targets.forEach(visitTarget); break;
      case 'AugAssign': if (s.target.type === 'Name') proc.declare(s.target.name); break;
      case 'For': visitTarget(s.target); visitStmts(s.body); if (s.orelse) visitStmts(s.orelse); break;
      case 'While': visitStmts(s.body); if (s.orelse) visitStmts(s.orelse); break;
      case 'If': s.cases.forEach((c) => visitStmts(c.body)); if (s.orelse) visitStmts(s.orelse); break;
      case 'Try':
        visitStmts(s.body);
        s.handlers.forEach((h) => { if (h.name) proc.declare(h.name); visitStmts(h.body); });
        if (s.orelse) visitStmts(s.orelse);
        if (s.finally) visitStmts(s.finally);
        break;
      case 'FunctionDef': proc.declare(s.name); break;
      case 'ClassDef': proc.declare(s.name); break;
      default: break; // ExprStmt, Return, Pass, Break, Continue, Raise, Del: no new bindings
    }
  };
  visitStmts(stmts);
}

class Compiler {
  constructor() {
    this.code = [];          // array of {op, a, b, line}
    this.constants = [];
    this.procs = [];         // Proc descriptors, index = procIndex
    this.errors = [];
  }

  err(msg, line) { this.errors.push(new CompileError(msg, line)); }
  emit(op, a, b, line) { this.code.push({ op, a, b, line }); return this.code.length - 1; }
  here() { return this.code.length; }
  patch(idx, addr) { this.code[idx].a = addr; }
  patchB(idx, addr) { this.code[idx].b = addr; }
  addConst(v) { this.constants.push(v); return this.constants.length - 1; }

  compileModule(ast) {
    const moduleProc = new Proc('module', '<module>', 0, []);
    moduleProc.entry = 0;
    this.procs.push(moduleProc);
    this.loopStack = [];
    this.procStack = [moduleProc];
    this.compileStmts(ast.body);
    this.emit(OP.CONST, this.addConst(null), null, 0);
    this.emit(OP.HALT, null, null, 0);
    return { code: this.code, constants: this.constants, procs: this.procs, errors: this.errors };
  }

  get proc() { return this.procStack[this.procStack.length - 1]; }

  // ---------- statements ----------
  compileStmts(stmts) { for (const s of stmts) this.compileStmt(s); }

  compileStmt(s) {
    switch (s.type) {
      case 'ExprStmt': this.compileExpr(s.expr); this.emit(OP.POP, null, null, s.line); break;
      case 'Assign': this.compileAssign(s); break;
      case 'AugAssign': this.compileAugAssign(s); break;
      case 'Pass': break;
      case 'Break': this.compileBreak(s); break;
      case 'Continue': this.compileContinue(s); break;
      case 'Return': this.compileReturn(s); break;
      case 'Raise': this.compileRaise(s); break;
      case 'Del': this.compileDel(s); break;
      case 'If': this.compileIf(s); break;
      case 'While': this.compileWhile(s); break;
      case 'For': this.compileFor(s); break;
      case 'Try': this.compileTry(s); break;
      case 'FunctionDef': this.compileFunctionDef(s); break;
      case 'ClassDef': this.compileClassDef(s); break;
      default: this.err(`compiler: unhandled statement ${s.type}`, s.line);
    }
  }

  // Compiler-internal temporary: a synthetic local (or, at module scope,
  // global) slot never reachable by user source, used to reorder stack
  // values around attribute/subscript targets.
  allocTemp() {
    this._tempCounter = (this._tempCounter || 0) + 1;
    const name = `$t${this._tempCounter}`;
    if (this.proc.kind !== 'module') return { local: true, slot: this.proc.declare(name) };
    return { local: false, name };
  }
  storeTemp(t, line) { if (t.local) this.emit(OP.STORE_LOCAL, t.slot, null, line); else this.emit(OP.STORE_GLOBAL, this.addConst(t.name), null, line); }
  loadTemp(t, line) { if (t.local) this.emit(OP.LOAD_LOCAL, t.slot, null, line); else this.emit(OP.LOAD_GLOBAL, this.addConst(t.name), null, line); }

  // Called with the value to store already on top of the stack.
  storeTo(target) {
    if (target.type === 'Name') {
      if (this.proc.kind !== 'module' && this.proc.locals.has(target.name)) {
        this.emit(OP.STORE_LOCAL, this.proc.locals.get(target.name), null, target.line);
      } else {
        this.emit(OP.STORE_GLOBAL, this.addConst(target.name), null, target.line);
      }
    } else if (target.type === 'Attribute') {
      const val = this.allocTemp(); this.storeTemp(val, target.line);
      this.compileExpr(target.obj);
      this.loadTemp(val, target.line);
      this.emit(OP.SET_ATTR, this.addConst(target.name), null, target.line);
    } else if (target.type === 'Subscript') {
      const val = this.allocTemp(); this.storeTemp(val, target.line);
      this.compileExpr(target.obj);
      this.compileExpr(target.index);
      this.loadTemp(val, target.line);
      this.emit(OP.SET_ITEM, null, null, target.line);
    } else if (target.type === 'Tuple' || target.type === 'List') {
      // stack top is an iterable value to unpack positionally; VM pushes
      // the elements back in reverse so target[0] ends up on top.
      this.emit(OP.UNPACK_SEQUENCE, target.elements.length, null, target.line);
      for (const el of target.elements) this.storeTo(el);
    } else {
      this.err(`cannot assign to this expression`, target.line);
    }
  }

  compileAssign(s) {
    this.compileExpr(s.value);
    for (let i = 0; i < s.targets.length; i++) {
      if (i < s.targets.length - 1) this.emit(OP.DUP, null, null, s.line);
      this.storeTo(s.targets[i]);
    }
  }

  compileAugAssign(s) {
    const t = s.target;
    if (t.type === 'Name') {
      this.compileExpr(t); this.compileExpr(s.value);
      this.emit(OP.BINARY, s.op, null, s.line);
      this.storeTo(t);
    } else if (t.type === 'Attribute') {
      const objTemp = this.allocTemp();
      this.compileExpr(t.obj); this.storeTemp(objTemp, s.line);
      this.loadTemp(objTemp, s.line);
      this.emit(OP.GET_ATTR, this.addConst(t.name), null, s.line);
      this.compileExpr(s.value);
      this.emit(OP.BINARY, s.op, null, s.line);
      const valTemp = this.allocTemp();
      this.storeTemp(valTemp, s.line);
      this.loadTemp(objTemp, s.line);
      this.loadTemp(valTemp, s.line);
      this.emit(OP.SET_ATTR, this.addConst(t.name), null, s.line);
    } else if (t.type === 'Subscript') {
      const objTemp = this.allocTemp(), idxTemp = this.allocTemp();
      this.compileExpr(t.obj); this.storeTemp(objTemp, s.line);
      this.compileExpr(t.index); this.storeTemp(idxTemp, s.line);
      this.loadTemp(objTemp, s.line); this.loadTemp(idxTemp, s.line);
      this.emit(OP.GET_ITEM, null, null, s.line);
      this.compileExpr(s.value);
      this.emit(OP.BINARY, s.op, null, s.line);
      const valTemp = this.allocTemp();
      this.storeTemp(valTemp, s.line);
      this.loadTemp(objTemp, s.line); this.loadTemp(idxTemp, s.line); this.loadTemp(valTemp, s.line);
      this.emit(OP.SET_ITEM, null, null, s.line);
    } else {
      this.err('cannot assign to this expression', s.line);
    }
  }

  compileReturn(s) {
    if (this.proc.kind === 'module') this.err("'return' outside function", s.line);
    if (s.value) this.compileExpr(s.value); else this.emit(OP.CONST, this.addConst(null), null, s.line);
    this.emit(OP.RETURN, null, null, s.line);
  }

  compileRaise(s) {
    if (s.exc) { this.compileExpr(s.exc); this.emit(OP.RAISE, 1, null, s.line); }
    else this.emit(OP.RAISE, 0, null, s.line);
  }

  compileDel(s) {
    const t = s.target;
    if (t.type === 'Subscript') { this.compileExpr(t.obj); this.compileExpr(t.index); this.emit(OP.DEL_ITEM, null, null, s.line); }
    else this.err("'del' target must be a subscript (e.g. 'del d[k]') in v0.1", s.line);
  }

  compileIf(s) {
    const endJumps = [];
    for (let i = 0; i < s.cases.length; i++) {
      const c = s.cases[i];
      this.compileExpr(c.test);
      const skip = this.emit(OP.JUMP_IF_FALSE, null, null, c.test.line);
      this.compileStmts(c.body);
      endJumps.push(this.emit(OP.JUMP, null, null, s.line));
      this.patch(skip, this.here());
    }
    if (s.orelse) this.compileStmts(s.orelse);
    for (const j of endJumps) this.patch(j, this.here());
  }

  compileWhile(s) {
    const top = this.here();
    this.compileExpr(s.test);
    const exit = this.emit(OP.JUMP_IF_FALSE, null, null, s.line);
    this.loopStack.push({ continueAddr: top, breakFixups: [], popIterOnBreak: false });
    this.compileStmts(s.body);
    this.emit(OP.JUMP, top, null, s.line);
    this.patch(exit, this.here());
    if (s.orelse) this.compileStmts(s.orelse);
    const loop = this.loopStack.pop();
    const after = this.here();
    for (const j of loop.breakFixups) this.patch(j, after);
  }

  compileFor(s) {
    this.compileExpr(s.iter);
    this.emit(OP.FOR_ITER_INIT, null, null, s.line);
    const top = this.here();
    const exhausted = this.emit(OP.FOR_ITER_NEXT, null, null, s.line);
    this.storeTo(s.target);
    this.loopStack.push({ continueAddr: top, breakFixups: [], popIterOnBreak: true });
    this.compileStmts(s.body);
    this.emit(OP.JUMP, top, null, s.line);
    this.patch(exhausted, this.here());
    if (s.orelse) this.compileStmts(s.orelse);
    const jAfter = this.emit(OP.JUMP, null, null, s.line);
    const loop = this.loopStack.pop();
    const after = this.here();
    this.patch(jAfter, after);
    for (const j of loop.breakFixups) this.patch(j, after);
  }

  compileBreak(s) {
    if (this.loopStack.length === 0) { this.err("'break' outside loop", s.line); return; }
    const loop = this.loopStack[this.loopStack.length - 1];
    if (loop.popIterOnBreak) this.emit(OP.POP, null, null, s.line); // discard the live iterator
    loop.breakFixups.push(this.emit(OP.JUMP, null, null, s.line));
  }
  compileContinue(s) {
    if (this.loopStack.length === 0) { this.err("'continue' outside loop", s.line); return; }
    this.emit(OP.JUMP, this.loopStack[this.loopStack.length - 1].continueAddr, null, s.line);
  }

  compileTry(s) {
    const hasFinally = !!s.finally;
    const hasExcept = s.handlers.length > 0;
    let finallySetup = null;
    if (hasFinally) finallySetup = this.emit(OP.SETUP_FINALLY, null, null, s.line);
    let trySetup = null;
    if (hasExcept) trySetup = this.emit(OP.SETUP_TRY, null, null, s.line);
    this.compileStmts(s.body);
    if (hasExcept) this.emit(OP.POP_TRY, null, null, s.line);
    if (s.orelse) this.compileStmts(s.orelse);
    const jSkipExcept = hasExcept ? this.emit(OP.JUMP, null, null, s.line) : null;
    if (hasExcept) {
      this.patch(trySetup, this.here());
      const afterExceptJumps = [];
      for (const h of s.handlers) {
        let n = 0;
        if (h.types) {
          const typeList = h.types.type === 'Tuple' ? h.types.elements : [h.types];
          n = typeList.length;
          for (const te of typeList) this.compileExpr(te);
        }
        const noMatch = this.emit(OP.MATCH_EXCEPT, n, null, h.types ? h.types.line : s.line);
        this.emit(OP.STORE_EXC, h.name ? this.storeExcTarget(h.name) : -1, h.name ? this.storeExcIsLocal(h.name) : 0, s.line);
        this.compileStmts(h.body);
        this.emit(OP.END_EXCEPT, null, null, s.line);
        afterExceptJumps.push(this.emit(OP.JUMP, null, null, s.line));
        this.patchB(noMatch, this.here());
      }
      // nothing matched: discard the lingering exception value and re-raise
      // (RAISE 0 uses the currently-handled exception, not the stack).
      this.emit(OP.POP, null, null, s.line);
      this.emit(OP.RAISE, 0, null, s.line);
      for (const j of afterExceptJumps) this.patch(j, this.here());
    }
    if (hasFinally) {
      if (jSkipExcept !== null) this.patch(jSkipExcept, this.here());
      this.emit(OP.POP_FINALLY, null, null, s.line);
      this.patch(finallySetup, this.here());
      this.compileStmts(s.finally);
      this.emit(OP.END_FINALLY, null, null, s.line);
    } else if (jSkipExcept !== null) {
      this.patch(jSkipExcept, this.here());
    }
  }
  storeExcTarget(name) {
    if (this.proc.kind !== 'module' && this.proc.locals.has(name)) return this.proc.locals.get(name);
    return this.addConst(name);
  }
  storeExcIsLocal(name) { return (this.proc.kind !== 'module' && this.proc.locals.has(name)) ? 1 : 0; }

  // ---------- functions & classes ----------
  compileFunctionDef(s) {
    const proc = new Proc('function', s.name, s.params.length, s.params.map((p) => p.name));
    proc.line = s.line;
    for (const p of s.params) proc.declare(p.name);
    collectLocals(s.body, proc);
    const procIndex = this.procs.length;
    this.procs.push(proc);

    // Defaults are evaluated NOW, in the defining scope, then handed to
    // MAKE_FUNCTION (spec §7: evaluated once, at def time).
    const defaults = s.params.filter((p) => p.default);
    for (const p of defaults) this.compileExpr(p.default);

    // Compile the body into the shared code array, after a jump that skips
    // over it during normal (non-call) execution.
    const skip = this.emit(OP.JUMP, null, null, s.line);
    proc.entry = this.here();
    this.procStack.push(proc);
    this.loopStackSave = this.loopStack; this.loopStack = [];
    this.compileStmts(s.body);
    this.emit(OP.CONST, this.addConst(null), null, s.line);
    this.emit(OP.RETURN, null, null, s.line);
    this.loopStack = this.loopStackSave;
    this.procStack.pop();
    this.patch(skip, this.here());

    this.emit(OP.MAKE_FUNCTION, procIndex, defaults.length, s.line);
    this.storeTo({ type: 'Name', name: s.name, line: s.line });
  }

  compileClassDef(s) {
    if (s.base) {
      if (this.proc.kind !== 'module' && this.proc.locals.has(s.base)) this.emit(OP.LOAD_LOCAL, this.proc.locals.get(s.base), null, s.line);
      else this.emit(OP.LOAD_GLOBAL, this.addConst(s.base), null, s.line);
    } else {
      this.emit(OP.CONST, this.addConst(null), null, s.line);
    }
    const proc = new Proc('class-body', s.name, 0, []);
    proc.line = s.line;
    collectLocals(s.body, proc);
    const procIndex = this.procs.length;
    this.procs.push(proc);

    const skip = this.emit(OP.JUMP, null, null, s.line);
    proc.entry = this.here();
    this.procStack.push(proc);
    this.loopStackSave2 = this.loopStack; this.loopStack = [];
    this.compileStmts(s.body);
    this.emit(OP.CONST, this.addConst(null), null, s.line);
    this.emit(OP.RETURN, null, null, s.line);
    this.loopStack = this.loopStackSave2;
    this.procStack.pop();
    this.patch(skip, this.here());

    this.emit(OP.MAKE_CLASS, procIndex, this.addConst(s.name), s.line);
    this.storeTo({ type: 'Name', name: s.name, line: s.line });
  }

  // ---------- expressions ----------
  compileExpr(e) {
    switch (e.type) {
      case 'Num': this.emit(OP.CONST, this.addConst(e.isFloat ? mkFloat(e.value) : e.value), null, e.line); break;
      case 'Str': this.emit(OP.CONST, this.addConst(e.value), null, e.line); break;
      case 'NameConst': this.emit(OP.CONST, this.addConst(e.value), null, e.line); break;
      case 'FStr': this.compileFStr(e); break;
      case 'Name': this.compileNameLoad(e); break;
      case 'List':
        for (const el of e.elements) this.compileExpr(el);
        this.emit(OP.BUILD_LIST, e.elements.length, null, e.line);
        break;
      case 'Tuple':
        for (const el of e.elements) this.compileExpr(el);
        this.emit(OP.BUILD_TUPLE, e.elements.length, null, e.line);
        break;
      case 'Dict':
        for (let i = 0; i < e.keys.length; i++) { this.compileExpr(e.keys[i]); this.compileExpr(e.values[i]); }
        this.emit(OP.BUILD_DICT, e.keys.length, null, e.line);
        break;
      case 'ListComp': this.compileListComp(e); break;
      case 'Unary':
        this.compileExpr(e.operand);
        this.emit(OP.UNARY, e.op, null, e.line);
        break;
      case 'BoolOp': this.compileBoolOp(e); break;
      case 'Binary':
        this.compileExpr(e.left); this.compileExpr(e.right);
        this.emit(OP.BINARY, e.op, null, e.line);
        break;
      case 'Compare': this.compileCompare(e); break;
      case 'Call':
        this.compileExpr(e.func);
        for (const a of e.args) this.compileExpr(a);
        this.emit(OP.CALL, e.args.length, null, e.line);
        break;
      case 'Attribute':
        this.compileExpr(e.obj);
        this.emit(OP.GET_ATTR, this.addConst(e.name), null, e.line);
        break;
      case 'Subscript':
        this.compileExpr(e.obj); this.compileExpr(e.index);
        this.emit(OP.GET_ITEM, null, null, e.line);
        break;
      case 'Slice': this.compileSlice(e); break;
      default: this.err(`compiler: unhandled expression ${e.type}`, e.line);
    }
  }

  compileNameLoad(e) {
    if (this.proc.kind !== 'module' && this.proc.locals.has(e.name)) this.emit(OP.LOAD_LOCAL, this.proc.locals.get(e.name), null, e.line);
    else this.emit(OP.LOAD_GLOBAL, this.addConst(e.name), null, e.line);
  }

  compileFStr(e) {
    if (e.parts.length === 0) { this.emit(OP.CONST, this.addConst(''), null, e.line); return; }
    let count = 0;
    for (const p of e.parts) {
      if (p.kind === 'lit') this.emit(OP.CONST, this.addConst(p.value), null, e.line);
      else { this.compileExpr(p.node); this.emit(OP.UNARY, 'str', null, e.line); }
      count++;
    }
    for (let i = 1; i < count; i++) this.emit(OP.BINARY, '+', null, e.line);
  }

  compileBoolOp(e) {
    this.compileExpr(e.left);
    if (e.op === 'and') {
      const j = this.emit(OP.JUMP_IF_FALSE_NOPOP, null, null, e.line);
      this.emit(OP.POP, null, null, e.line);
      this.compileExpr(e.right);
      this.patch(j, this.here());
    } else {
      const j = this.emit(OP.JUMP_IF_TRUE_NOPOP, null, null, e.line);
      this.emit(OP.POP, null, null, e.line);
      this.compileExpr(e.right);
      this.patch(j, this.here());
    }
  }

  compileCompare(e) {
    if (e.ops.length === 1) {
      this.compileExpr(e.left); this.compileExpr(e.comparators[0]);
      this.emit(OP.COMPARE, e.ops[0], null, e.line);
      return;
    }
    // Chained (a < b < c == a<b and b<c, each operand evaluated once) via
    // synthetic temps rather than stack rotation.
    const line = e.line;
    let leftTemp = this.allocTemp();
    this.compileExpr(e.left);
    this.storeTemp(leftTemp, line);
    const falseJumps = [];
    for (let i = 0; i < e.ops.length; i++) {
      this.loadTemp(leftTemp, line);
      this.compileExpr(e.comparators[i]);
      const isLast = i === e.ops.length - 1;
      let rightTemp = null;
      if (!isLast) {
        rightTemp = this.allocTemp();
        this.emit(OP.DUP, null, null, line);
        this.storeTemp(rightTemp, line);
      }
      this.emit(OP.COMPARE, e.ops[i], null, line);
      if (!isLast) {
        falseJumps.push(this.emit(OP.JUMP_IF_FALSE, null, null, line));
        leftTemp = rightTemp;
      }
    }
    const doneJump = this.emit(OP.JUMP, null, null, line);
    for (const j of falseJumps) this.patch(j, this.here());
    this.emit(OP.CONST, this.addConst(false), null, line);
    this.patch(doneJump, this.here());
  }

  compileSlice(e) {
    this.compileExpr(e.obj);
    e.start ? this.compileExpr(e.start) : this.emit(OP.CONST, this.addConst(null), null, e.line);
    e.stop ? this.compileExpr(e.stop) : this.emit(OP.CONST, this.addConst(null), null, e.line);
    e.step ? this.compileExpr(e.step) : this.emit(OP.CONST, this.addConst(null), null, e.line);
    this.emit(OP.GET_SLICE, null, null, e.line);
  }

  compileListComp(e) {
    this.emit(OP.BUILD_LIST, 0, null, e.line);
    this.compileExpr(e.iter);
    this.emit(OP.FOR_ITER_INIT, null, null, e.line);
    const top = this.here();
    const exhausted = this.emit(OP.FOR_ITER_NEXT, null, null, e.line);
    this.storeTo(e.target);
    if (e.cond) {
      this.compileExpr(e.cond);
      const skip = this.emit(OP.JUMP_IF_FALSE, null, null, e.line);
      this.compileExpr(e.elt);
      this.emit(OP.LIST_APPEND, null, null, e.line);
      this.patch(skip, this.here());
    } else {
      this.compileExpr(e.elt);
      this.emit(OP.LIST_APPEND, null, null, e.line);
    }
    this.emit(OP.JUMP, top, null, e.line);
    this.patch(exhausted, this.here());
  }
}

function compileAst(ast) {
  const c = new Compiler();
  const chunk = c.compileModule(ast);
  return chunk;
}

export { CompileError, Proc, collectLocals, Compiler, compileAst };
