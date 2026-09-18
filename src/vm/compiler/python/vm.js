// MiniPy virtual machine: a stack machine over the compiled bytecode.

import { OP } from './opcodes.js';
import {
  PyFloat,
  mkFloat,
  isNum,
  isInt,
  numVal,
  PyTuple,
  PyDict,
  PyRange,
  PyFunction,
  PyClass,
  PyInstance,
  PyBoundMethod,
  PyBuiltinFunction,
  typeName,
  isTruthy,
  numToStr,
  pyStr,
  pyRepr,
  pyEquals,
  pyIs,
} from './values.js';
import { installBuiltins } from './builtins.js';
import { RuntimeFault } from './diagnostics.js';

// Signals used purely for internal JS-level control flow; never exposed.
class RaiseSignal {
  constructor(pyValue, line) { this.pyValue = pyValue; this.line = line; this.traceback = []; }
}
class FatalSignal { // stack/instruction-budget exhaustion: uncatchable by design (spec §11)
  constructor(reason, line) { this.reason = reason; this.line = line; }
}

class Frame {
  constructor(proc, locals, name, callerLine) {
    this.proc = proc;
    this.locals = locals;
    this.pc = proc.entry;
    this.name = name;
    this.callerLine = callerLine;
    this.tryStack = [];       // {kind:'except'|'finally', addr, stackDepth}
    this.pendingExcStack = []; // for nested finally: null | pyExcValue
    this.line = proc.line;
  }
}

class VM {
  constructor(chunk, opts = {}) {
    this.chunk = chunk;
    this.code = chunk.code;
    this.constants = chunk.constants;
    this.procs = chunk.procs;
    this.stack = [];
    this.globals = new Map();
    this.out = opts.out || ((s) => process.stdout.write(s + '\n'));
    this.maxSteps = opts.maxSteps || 5_000_000;
    this.maxDepth = opts.maxDepth || 400;
    this.steps = 0;
    this.depth = 0;
    this.currentException = null; // for bare `raise` re-raise inside a handler
    this.exceptionClasses = installBuiltins(this);
  }

  push(v) { this.stack.push(v); }
  pop() { return this.stack.pop(); }
  peek(o = 0) { return this.stack[this.stack.length - 1 - o]; }

  // ---- exception construction / raising ----
  makeException(clsName, message) {
    const cls = this.exceptionClasses[clsName] || this.exceptionClasses.Exception;
    const inst = new PyInstance(cls);
    inst.attrs.set('args', new PyTuple([message]));
    inst.attrs.set('__msg__', message);
    return inst;
  }
  raise(clsName, message, line) {
    throw new RaiseSignal(this.makeException(clsName, message), line);
  }
  isExceptionInstance(v) {
    return v instanceof PyInstance && v.cls.isSubclassOf(this.exceptionClasses.Exception);
  }

  step() {
    if (++this.steps > this.maxSteps) throw new FatalSignal('instruction budget exceeded', this.frame.line);
  }

  // ---- running ----
  run() {
    const moduleProc = this.procs[0];
    const frame = new Frame(moduleProc, [], '<module>', 0);
    try {
      this.execFrame(frame);
      return { ok: true, output: null };
    } catch (sig) {
      if (sig instanceof RaiseSignal) {
        const excType = sig.pyValue instanceof PyInstance ? sig.pyValue.cls.name : typeName(sig.pyValue);
        const msg = sig.pyValue instanceof PyInstance && sig.pyValue.attrs.has('__msg__') ? pyStr(sig.pyValue.attrs.get('__msg__')) : pyStr(sig.pyValue);
        return { ok: false, fault: new RuntimeFault(excType, msg, sig.line, sig.traceback) };
      }
      if (sig instanceof FatalSignal) {
        return { ok: false, fault: new RuntimeFault('Fatal', sig.reason, sig.line, []) };
      }
      throw sig;
    }
  }

  // Calls any callable value with already-evaluated arguments. Used by CALL
  // and by class instantiation (__init__). Recurses through execFrame for
  // user functions, so JS's own call stack is the Python call stack.
  callValue(callee, args, line) {
    if (callee instanceof PyBuiltinFunction) return callee.fn(this, args, line);
    if (callee instanceof PyBoundMethod) return this.callValue(callee.func, [callee.instance, ...args], line);
    if (callee instanceof PyClass) {
      const inst = new PyInstance(callee);
      const init = callee.findMethod('__init__');
      if (init) {
        this.callValue(new PyBoundMethod(inst, init), args, line);
      } else if (callee.isSubclassOf(this.exceptionClasses.Exception)) {
        // Built-in Exception (and any subclass without its own __init__)
        // behaves like Python's BaseException.__init__(*args).
        inst.attrs.set('args', new PyTuple(args));
        if (args.length > 0) inst.attrs.set('__msg__', args[0]);
      } else if (args.length > 0) {
        this.raise('TypeError', `${callee.name}() takes no arguments`, line);
      }
      return inst;
    }
    if (callee instanceof PyFunction) {
      const proc = callee.proc;
      const minArgs = proc.arity - callee.defaults.length;
      if (args.length < minArgs || args.length > proc.arity) {
        this.raise('TypeError', `${callee.name}() takes ${proc.arity} argument(s) but ${args.length} were given`, line);
      }
      const locals = new Array(proc.localNames.length).fill(undefined);
      for (let i = 0; i < proc.arity; i++) {
        locals[i] = i < args.length ? args[i] : callee.defaults[i - minArgs];
      }
      if (this.depth >= this.maxDepth) throw new FatalSignal('maximum recursion depth exceeded', line);
      this.depth++;
      try {
        const frame = new Frame(proc, locals, callee.name + '()', line);
        return this.execFrame(frame);
      } finally { this.depth--; }
    }
    this.raise('TypeError', `'${typeName(callee)}' object is not callable`, line);
  }

  // Runs a single frame's instruction stream to completion, returning its
  // Python return value. try/except/finally handling for THIS frame lives
  // here; an exception this frame can't handle propagates as a JS throw,
  // which — because each nested Python call is a nested JS call via
  // callValue — naturally unwinds exactly the Python frames it should.
  execFrame(frame) {
    this.frame = frame;
    for (;;) {
      try {
        for (;;) {
          this.step();
          const r = this.exec1(frame);
          if (r !== undefined) return r;
        }
      } catch (sig) {
        if (sig instanceof RaiseSignal) {
          if (this.tryHandleInFrame(frame, sig)) continue;
          if (frame.name !== '<module>') sig.traceback.push({ name: frame.name, callLine: frame.callerLine });
          throw sig;
        }
        throw sig;
      } finally {
        this.frame = frame;
      }
    }
  }

  tryHandleInFrame(frame, sig) {
    while (frame.tryStack.length > 0) {
      const entry = frame.tryStack.pop();
      this.stack.length = entry.stackDepth;
      if (entry.kind === 'except') {
        this.currentException = sig.pyValue;
        this.push(sig.pyValue);
        frame.pc = entry.addr;
        return true;
      }
      if (entry.kind === 'finally') {
        this.currentException = sig.pyValue;
        frame.pendingExcStack.push({ kind: 'exc', value: sig.pyValue });
        frame.pc = entry.addr;
        return true;
      }
    }
    return false;
  }

  // Executes exactly one instruction; returns undefined to keep looping, or
  // a value if RETURN just fired (that value bubbles up as execFrame's
  // return value).
  exec1(frame) {
    const instr = this.code[frame.pc];
    frame.line = instr.line;
    const { op, a, b } = instr;
    switch (op) {
      case OP.CONST: this.push(this.constants[a]); frame.pc++; return;
      case OP.POP: this.pop(); frame.pc++; return;
      case OP.DUP: this.push(this.peek()); frame.pc++; return;

      case OP.LOAD_GLOBAL: {
        const name = this.constants[a];
        if (!this.globals.has(name)) this.raise('NameError', `name '${name}' is not defined`, instr.line);
        this.push(this.globals.get(name));
        frame.pc++; return;
      }
      case OP.STORE_GLOBAL: this.globals.set(this.constants[a], this.pop()); frame.pc++; return;
      case OP.LOAD_LOCAL: {
        const v = frame.locals[a];
        if (v === undefined) this.raise('NameError', `local variable '${frame.proc.localNames[a]}' referenced before assignment`, instr.line);
        this.push(v);
        frame.pc++; return;
      }
      case OP.STORE_LOCAL: frame.locals[a] = this.pop(); frame.pc++; return;

      case OP.BUILD_LIST: { const items = this.popN(a); this.push(items); frame.pc++; return; }
      case OP.BUILD_TUPLE: { const items = this.popN(a); this.push(new PyTuple(items)); frame.pc++; return; }
      case OP.BUILD_DICT: {
        const d = new PyDict();
        const flat = this.popN(a * 2);
        for (let i = 0; i < flat.length; i += 2) {
          if (PyDict.keyOf(flat[i]) === null) this.raise('TypeError', `unhashable type: '${typeName(flat[i])}'`, instr.line);
          d.set(flat[i], flat[i + 1]);
        }
        this.push(d); frame.pc++; return;
      }
      // Stack here is [..., list, iterator, value] (the iterator sits
      // between the accumulating list and the freshly computed element).
      case OP.LIST_APPEND: { const v = this.pop(); this.peek(1).push(v); frame.pc++; return; }
      case OP.UNPACK_SEQUENCE: {
        const seq = this.toSequenceArray(this.pop(), instr.line);
        if (seq.length !== a) this.raise('ValueError', `too ${seq.length > a ? 'many' : 'few'} values to unpack (expected ${a})`, instr.line);
        for (let i = seq.length - 1; i >= 0; i--) this.push(seq[i]);
        frame.pc++; return;
      }

      case OP.BINARY: { const r = this.pop(); const l = this.pop(); this.push(this.binaryOp(a, l, r, instr.line)); frame.pc++; return; }
      case OP.UNARY: this.push(this.unaryOp(a, this.pop(), instr.line)); frame.pc++; return;
      case OP.COMPARE: { const r = this.pop(); const l = this.pop(); this.push(this.compareOp(a, l, r, instr.line)); frame.pc++; return; }

      case OP.GET_ITEM: { const idx = this.pop(); const obj = this.pop(); this.push(this.getItem(obj, idx, instr.line)); frame.pc++; return; }
      case OP.SET_ITEM: { const val = this.pop(); const idx = this.pop(); const obj = this.pop(); this.setItem(obj, idx, val, instr.line); frame.pc++; return; }
      case OP.DEL_ITEM: { const idx = this.pop(); const obj = this.pop(); this.delItem(obj, idx, instr.line); frame.pc++; return; }
      case OP.GET_SLICE: {
        const step = this.pop(), stop = this.pop(), start = this.pop(), obj = this.pop();
        this.push(this.getSlice(obj, start, stop, step, instr.line)); frame.pc++; return;
      }
      case OP.GET_ATTR: { const obj = this.pop(); this.push(this.getAttr(obj, this.constants[a], instr.line)); frame.pc++; return; }
      case OP.SET_ATTR: { const val = this.pop(); const obj = this.pop(); this.setAttr(obj, this.constants[a], val, instr.line); frame.pc++; return; }

      case OP.JUMP: frame.pc = a; return;
      case OP.JUMP_IF_FALSE: { const v = this.pop(); frame.pc = isTruthy(v) ? frame.pc + 1 : a; return; }
      case OP.JUMP_IF_TRUE_NOPOP: { frame.pc = isTruthy(this.peek()) ? a : frame.pc + 1; return; }
      case OP.JUMP_IF_FALSE_NOPOP: { frame.pc = !isTruthy(this.peek()) ? a : frame.pc + 1; return; }

      case OP.CALL: {
        const args = this.popN(a);
        const callee = this.pop();
        this.push(this.callValue(callee, args, instr.line));
        frame.pc++; return;
      }
      case OP.RETURN: {
        const v = this.pop();
        // A `finally` guarding this point must still run before we actually
        // leave the function (real Python semantics). Any `except` entries
        // encountered while unwinding to it are discarded unfired.
        let finallyEntry = null;
        while (frame.tryStack.length > 0) {
          const e = frame.tryStack[frame.tryStack.length - 1];
          if (e.kind === 'finally') { finallyEntry = frame.tryStack.pop(); break; }
          frame.tryStack.pop();
        }
        if (finallyEntry) {
          this.stack.length = finallyEntry.stackDepth;
          frame.pendingExcStack.push({ kind: 'return', value: v });
          frame.pc = finallyEntry.addr;
          return;
        }
        if (frame.proc.kind === 'class-body') return this.buildClassFromFrame(frame, v, instr.line);
        return v;
      }
      case OP.MAKE_FUNCTION: {
        const defaults = this.popN(b);
        const proc = this.procs[a];
        this.push(new PyFunction(proc.name, proc, defaults));
        frame.pc++; return;
      }
      case OP.MAKE_CLASS: {
        // executed at the RUN_CLASS_BODY-equivalent site: run the class
        // body as an ordinary call, tagging the frame so RETURN builds a
        // PyClass instead of an ordinary value.
        const base = this.pop();
        if (base !== null && !(base instanceof PyClass)) this.raise('TypeError', 'base must be a class', instr.line);
        const proc = this.procs[a];
        const locals = new Array(proc.localNames.length).fill(undefined);
        const bodyFrame = new Frame(proc, locals, `<class ${this.constants[b]}>`, instr.line);
        bodyFrame.classBody = { name: this.constants[b], base };
        if (this.depth >= this.maxDepth) throw new FatalSignal('maximum recursion depth exceeded', instr.line);
        this.depth++;
        let result;
        try { result = this.execFrame(bodyFrame); } finally { this.depth--; }
        this.push(result);
        frame.pc++; return;
      }

      case OP.FOR_ITER_INIT: { this.push(this.makeIterator(this.pop(), instr.line)); frame.pc++; return; }
      case OP.FOR_ITER_NEXT: {
        const it = this.peek();
        const n = it.next();
        if (n.done) { this.pop(); frame.pc = a; return; }
        this.push(n.value);
        frame.pc++; return;
      }

      case OP.SETUP_TRY: frame.tryStack.push({ kind: 'except', addr: a, stackDepth: this.stack.length }); frame.pc++; return;
      case OP.POP_TRY: frame.tryStack.pop(); frame.pc++; return;
      case OP.SETUP_FINALLY: frame.tryStack.push({ kind: 'finally', addr: a, stackDepth: this.stack.length }); frame.pc++; return;
      case OP.POP_FINALLY: frame.tryStack.pop(); frame.pendingExcStack.push(null); frame.pc++; return;
      case OP.END_FINALLY: {
        const pending = frame.pendingExcStack.pop();
        if (pending) {
          if (pending.kind === 'exc') throw new RaiseSignal(pending.value, instr.line);
          if (pending.kind === 'return') {
            if (frame.proc.kind === 'class-body') return this.buildClassFromFrame(frame, pending.value, instr.line);
            return pending.value;
          }
        }
        this.currentException = null;
        frame.pc++; return;
      }
      case OP.MATCH_EXCEPT: {
        const types = this.popN(a);
        const exc = this.peek();
        const match = a === 0 || types.some((t) => t instanceof PyClass && exc instanceof PyInstance && exc.cls.isSubclassOf(t));
        frame.pc = match ? frame.pc + 1 : b;
        return;
      }
      case OP.STORE_EXC: {
        const exc = this.pop();
        this.currentException = exc;
        if (a !== -1) { if (b === 1) frame.locals[a] = exc; else this.globals.set(this.constants[a], exc); }
        frame.pc++; return;
      }
      case OP.RAISE: {
        if (a === 1) {
          const v = this.pop();
          if (!this.isExceptionInstance(v)) this.raise('TypeError', 'exceptions must derive from Exception', instr.line);
          throw new RaiseSignal(v, instr.line);
        }
        if (!this.currentException) this.raise('RuntimeError', 'No active exception to re-raise', instr.line);
        throw new RaiseSignal(this.currentException, instr.line);
      }
      case OP.END_EXCEPT: this.currentException = null; frame.pc++; return;

      case OP.HALT: return this.pop();
      default: throw new Error('unknown opcode ' + op);
    }
  }

  popN(n) { const out = this.stack.splice(this.stack.length - n, n); return out; }

  buildClassFromFrame(frame, _ignoredReturn, line) {
    const cls = new PyClass(frame.classBody.name, frame.classBody.base);
    frame.proc.localNames.forEach((name, slot) => {
      if (frame.locals[slot] !== undefined) cls.methods.set(name, frame.locals[slot]);
    });
    return cls;
  }

  // ---- operators ----
  binaryOp(op, a, b, line) {
    if (op === '+') {
      if (isNum(a) && isNum(b)) return this.numAdd(a, b);
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
      this.raise('TypeError', `unsupported operand type(s) for +: '${typeName(a)}' and '${typeName(b)}'`, line);
    }
    if (op === '*') {
      if (isNum(a) && isNum(b)) return this.numMul(a, b);
      const rep = (seq, n, wrap) => { if (n < 0) n = 0; const out = []; for (let i = 0; i < n; i++) out.push(...seq); return wrap(out); };
      if (typeof a === 'string' && isInt(b)) return a.repeat(Math.max(0, numVal(b)));
      if (typeof b === 'string' && isInt(a)) return b.repeat(Math.max(0, numVal(a)));
      if (Array.isArray(a) && isInt(b)) return rep(a, numVal(b), (x) => x);
      if (Array.isArray(b) && isInt(a)) return rep(b, numVal(a), (x) => x);
      if (a instanceof PyTuple && isInt(b)) return rep(a.items, numVal(b), (x) => new PyTuple(x));
      if (b instanceof PyTuple && isInt(a)) return rep(b.items, numVal(a), (x) => new PyTuple(x));
      this.raise('TypeError', `unsupported operand type(s) for *: '${typeName(a)}' and '${typeName(b)}'`, line);
    }
    if (!isNum(a) || !isNum(b)) this.raise('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`, line);
    const x = numVal(a), y = numVal(b);
    const bothInt = isInt(a) && isInt(b);
    switch (op) {
      case '-': return bothInt ? x - y : mkFloat(x - y);
      case '/': if (y === 0) this.raise('ZeroDivisionError', 'division by zero', line); return mkFloat(x / y);
      case '//': {
        if (y === 0) this.raise('ZeroDivisionError', 'integer division or modulo by zero', line);
        const r = Math.floor(x / y);
        return bothInt ? r : mkFloat(r);
      }
      case '%': {
        if (y === 0) this.raise('ZeroDivisionError', 'modulo by zero', line);
        const r = x - Math.floor(x / y) * y;
        return bothInt ? r : mkFloat(r);
      }
      case '**': {
        const r = Math.pow(x, y);
        return (bothInt && y >= 0) ? r : mkFloat(r);
      }
      default: throw new Error('bad binary op ' + op);
    }
  }
  numAdd(a, b) { const r = numVal(a) + numVal(b); return (isInt(a) && isInt(b)) ? r : mkFloat(r); }
  numMul(a, b) { const r = numVal(a) * numVal(b); return (isInt(a) && isInt(b)) ? r : mkFloat(r); }

  unaryOp(op, v, line) {
    if (op === 'not') return !isTruthy(v);
    if (op === 'str') return pyStr(v);
    if (!isNum(v)) this.raise('TypeError', `bad operand type for unary ${op}: '${typeName(v)}'`, line);
    const x = numVal(v);
    if (op === '-') return isInt(v) ? -x : mkFloat(-x);
    if (op === '+') return isInt(v) ? x : mkFloat(x);
    throw new Error('bad unary op ' + op);
  }

  compareOp(op, l, r, line) {
    switch (op) {
      case '==': return pyEquals(l, r);
      case '!=': return !pyEquals(l, r);
      case 'is': return pyIs(l, r);
      case 'is not': return !pyIs(l, r);
      case 'in': return this.containsCheck(l, r, line);
      case 'not in': return !this.containsCheck(l, r, line);
      case '<': case '<=': case '>': case '>=': {
        let ok, x, y;
        if (isNum(l) && isNum(r)) { ok = true; x = numVal(l); y = numVal(r); }
        else if (typeof l === 'string' && typeof r === 'string') { ok = true; x = l; y = r; }
        else ok = false;
        if (!ok) this.raise('TypeError', `'${op}' not supported between instances of '${typeName(l)}' and '${typeName(r)}'`, line);
        if (op === '<') return x < y;
        if (op === '<=') return x <= y;
        if (op === '>') return x > y;
        return x >= y;
      }
      default: throw new Error('bad compare op ' + op);
    }
  }
  containsCheck(item, container, line) {
    if (typeof container === 'string') {
      if (typeof item !== 'string') this.raise('TypeError', "'in <string>' requires string as left operand", line);
      return container.includes(item);
    }
    if (Array.isArray(container)) return container.some((x) => pyEquals(x, item));
    if (container instanceof PyTuple) return container.items.some((x) => pyEquals(x, item));
    if (container instanceof PyDict) return container.has(item);
    if (container instanceof PyRange) { const v = numVal(item); return isInt(item) && v >= container.start && v < container.stop && (v - container.start) % container.step === 0; }
    this.raise('TypeError', `argument of type '${typeName(container)}' is not iterable`, line);
  }

  // ---- items / attrs / slices ----
  normIndex(i, len, line, what = 'index') {
    if (!isInt(i)) this.raise('TypeError', `${what} must be an integer`, line);
    let v = numVal(i);
    if (v < 0) v += len;
    return v;
  }
  getItem(obj, idx, line) {
    if (Array.isArray(obj) || obj instanceof PyTuple || typeof obj === 'string') {
      const arr = Array.isArray(obj) ? obj : (obj instanceof PyTuple ? obj.items : obj);
      const len = arr.length;
      const i = this.normIndex(idx, len, line);
      if (i < 0 || i >= len) this.raise('IndexError', `${typeName(obj)} index out of range`, line);
      return typeof obj === 'string' ? obj[i] : arr[i];
    }
    if (obj instanceof PyDict) {
      if (!obj.has(idx)) this.raise('KeyError', pyStr(idx), line);
      return obj.get(idx);
    }
    if (obj instanceof PyRange) {
      const i = this.normIndex(idx, obj.length, line);
      if (i < 0 || i >= obj.length) this.raise('IndexError', 'range index out of range', line);
      return obj.at(i);
    }
    this.raise('TypeError', `'${typeName(obj)}' object is not subscriptable`, line);
  }
  setItem(obj, idx, val, line) {
    if (Array.isArray(obj)) {
      const i = this.normIndex(idx, obj.length, line);
      if (i < 0 || i >= obj.length) this.raise('IndexError', 'list assignment index out of range', line);
      obj[i] = val; return;
    }
    if (obj instanceof PyDict) {
      if (PyDict.keyOf(idx) === null) this.raise('TypeError', `unhashable type: '${typeName(idx)}'`, line);
      obj.set(idx, val); return;
    }
    this.raise('TypeError', `'${typeName(obj)}' object does not support item assignment`, line);
  }
  delItem(obj, idx, line) {
    if (Array.isArray(obj)) { const i = this.normIndex(idx, obj.length, line); if (i < 0 || i >= obj.length) this.raise('IndexError', 'list index out of range', line); obj.splice(i, 1); return; }
    if (obj instanceof PyDict) { if (!obj.has(idx)) this.raise('KeyError', pyStr(idx), line); obj.delete(idx); return; }
    this.raise('TypeError', `'${typeName(obj)}' object doesn't support item deletion`, line);
  }
  getSlice(obj, start, stop, step, line) {
    const isStr = typeof obj === 'string';
    const isTuple = obj instanceof PyTuple;
    if (!Array.isArray(obj) && !isStr && !isTuple) this.raise('TypeError', `'${typeName(obj)}' object is not subscriptable`, line);
    const arr = isStr ? [...obj] : (isTuple ? obj.items : obj);
    const st = step === null ? 1 : numVal(step);
    if (st === 0) this.raise('ValueError', 'slice step cannot be zero', line);
    const len = arr.length;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let lo, hi;
    if (st > 0) {
      lo = start === null ? 0 : clamp(numVal(start) < 0 ? numVal(start) + len : numVal(start), 0, len);
      hi = stop === null ? len : clamp(numVal(stop) < 0 ? numVal(stop) + len : numVal(stop), 0, len);
    } else {
      lo = start === null ? len - 1 : clamp(numVal(start) < 0 ? numVal(start) + len : numVal(start), -1, len - 1);
      hi = stop === null ? -1 : clamp(numVal(stop) < 0 ? numVal(stop) + len : numVal(stop), -1, len - 1);
    }
    const out = [];
    if (st > 0) { for (let i = lo; i < hi; i += st) out.push(arr[i]); }
    else { for (let i = lo; i > hi; i += st) out.push(arr[i]); }
    if (isStr) return out.join('');
    if (isTuple) return new PyTuple(out);
    return out;
  }
  getAttr(obj, name, line) {
    if (obj instanceof PyInstance) {
      if (obj.attrs.has(name)) return obj.attrs.get(name);
      const m = obj.cls.findMethod(name);
      if (m) return m instanceof PyFunction ? new PyBoundMethod(obj, m) : m;
      this.raise('AttributeError', `'${obj.cls.name}' object has no attribute '${name}'`, line);
    }
    if (obj instanceof PyClass) {
      const m = obj.findMethod(name);
      if (m !== null && m !== undefined) return m;
      this.raise('AttributeError', `type object '${obj.name}' has no attribute '${name}'`, line);
    }
    const bound = this.builtinMethod(obj, name, line);
    if (bound) return bound;
    this.raise('AttributeError', `'${typeName(obj)}' object has no attribute '${name}'`, line);
  }
  setAttr(obj, name, val, line) {
    if (obj instanceof PyInstance) { obj.attrs.set(name, val); return; }
    this.raise('AttributeError', `'${typeName(obj)}' object attributes are read-only`, line);
  }

  builtinMethod(obj, name, line) {
    return this.methodTable?.(obj, name, line);
  }

  toSequenceArray(v, line) {
    if (Array.isArray(v)) return v;
    if (v instanceof PyTuple) return v.items;
    if (typeof v === 'string') return [...v];
    if (v instanceof PyRange) return v.toArray();
    this.raise('TypeError', `cannot unpack non-iterable ${typeName(v)} object`, line);
  }

  makeIterator(obj, line) {
    if (Array.isArray(obj)) { let i = 0; return { next: () => i < obj.length ? { value: obj[i++] } : { done: true } }; }
    if (obj instanceof PyTuple) { const a = obj.items; let i = 0; return { next: () => i < a.length ? { value: a[i++] } : { done: true } }; }
    if (typeof obj === 'string') { let i = 0; return { next: () => i < obj.length ? { value: obj[i++] } : { done: true } }; }
    if (obj instanceof PyRange) { let i = 0; const n = obj.length; return { next: () => i < n ? { value: obj.at(i++) } : { done: true } }; }
    if (obj instanceof PyDict) { const ks = obj.keys(); let i = 0; return { next: () => i < ks.length ? { value: ks[i++] } : { done: true } }; }
    this.raise('TypeError', `'${typeName(obj)}' object is not iterable`, line);
  }
}

export { VM, Frame, RaiseSignal, FatalSignal };
