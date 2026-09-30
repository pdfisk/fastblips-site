// The virtual machine: one stack machine for every chunk, whichever front end
// compiled it. Crumb and MiniPy share the instruction set of opcodes.js.
//
// All execution state (ip, value stack, frames, globals, exception handlers)
// lives on the VM, so runSlice() can stop after any instruction and resume
// later. That is what lets the Scheduler interleave programs, whatever
// language they are written in.
//
// Types are checked at the instruction. Crumb's opcodes fail with a fatal
// runtime error (spec section 11). MiniPy's opcodes raise a MiniPy exception,
// which a `try` in the program may catch; an uncaught one ends the program
// with a RuntimeFault, just like a Crumb error.

import { Op, OP_NAMES, FORMAT } from './opcodes.js';
import { NOTHING, UNBOUND, CrumbArray, PyTuple, PyDict, PyFunction, PyClass, PyInstance, PyBoundMethod, PyBuiltinFunction } from './values.js';
import { Fault, describeFault, RuntimeFault } from './faults.js';
import { typeName, toStr, formatNumber, isNumber, isString, isBoolean, isArray, isObject } from './runtime/crumb-values.js';
import { BUILTIN_LIST, BuiltinError } from './runtime/crumb-builtins.js';
import { newObject, callMethod } from './runtime/crumb-objects.js';
import { typeName as pyTypeName, isTruthy, pyStr } from './runtime/python-values.js';
import * as py from './runtime/python-ops.js';

/** Kept under its old name: Crumb code and tests import CrumbRuntimeError. */
export { RuntimeFault, RuntimeFault as CrumbRuntimeError };

const ORDERED = new Set([Op.LT, Op.LE, Op.GT, Op.GE]);
const FORMATTERS = { [FORMAT.CRUMB]: toStr, [FORMAT.PYTHON]: pyStr };

/** A MiniPy exception in flight. Internal: never escapes runSlice. */
class PyRaise {
  constructor(value, line) {
    this.value = value;
    this.line = line;
    this.traceback = [];
  }
}

/**
 * Blocks the thread for `ms` milliseconds. Used only by VM.run(), which is
 * synchronous; a Scheduler never blocks and instead requeues the process.
 * Atomics.wait is unavailable on a browser's main thread, hence the fallback.
 */
function blockingSleep(ms) {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* busy-wait */ }
  }
}

export class VM {
  /**
   * @param {object} chunk  from either compiler. Fields the VM reads:
   *   code, lines, constants, procedures, entry, globalCount, globalNames,
   *   and optionally language ('crumb' | 'python'), globalInit (initial
   *   global values), initialSlot (what an unassigned slot holds) and
   *   runtime (MiniPy's runtime library).
   */
  constructor(chunk, {
    out = (text) => process.stdout.write(`${text}\n`),
    transcript = null,   // sink for Transcript / transcript(); defaults to `out`
    maxDepth = 10000,
    maxSteps = Infinity,
    random = Math.random,
    sleep = blockingSleep,   // (ms) => void, used by run() for Sleep / sleep()
    gui = null,              // widget host for New Label / Label() etc. (runtime/widgets.js)
    fetch = globalThis.fetch?.bind(globalThis) ?? null,   // for Fetch / fetch() (runtime/fetch.js)
  } = {}) {
    this.chunk = chunk;
    this.language = chunk.language ?? 'crumb';
    this.python = chunk.runtime ?? null;
    this.out = out;
    this.transcript = transcript ?? out;
    this.maxDepth = maxDepth;
    this.maxSteps = maxSteps;
    this.random = random;
    this.sleep = sleep;
    this.gui = gui;
    this.fetch = fetch;

    this.slotFill = 'initialSlot' in chunk ? chunk.initialSlot : NOTHING;
    this.globals = chunk.globalInit
      ? Array.from({ length: chunk.globalCount }, (_, i) => chunk.globalInit[i])
      : new Array(chunk.globalCount).fill(this.slotFill);
    this.stack = [];
    this.frames = [];
    this.module = { handlers: null, pending: null };   // try blocks in module code
    this.currentException = null;
    this.ip = chunk.entry;
    this.opIp = chunk.entry;
    this.steps = 0;
    this.halted = false;
    this.sleepMs = null;   // set by Sleep / sleep(); makes runSlice yield

    // A call waiting for a promise (Fetch / fetch()): see block().
    this.blocked = null;   // the pending request's token while waiting
    this.blockedOn = null; // a promise that settles when the wait is over
    this.resumed = null;   // { value } or { error, onError }, applied on the next slice

    // Events (widget clicks). Once a handler is registered the program does
    // not halt at the end of its module code: it waits there for events and
    // runs each one's handler, until it is killed.
    this.listening = false;
    this.events = [];      // queued { handler, args }
    this.waiting = false;  // at the end of module code with no event queued
    this.onWake = null;    // called when an event arrives while waiting (set by the Scheduler)
  }

  /**
   * Registers an event handler: { proc } (a Crumb Sub) or { fn } (a MiniPy
   * callable). register(post) is given the function the host calls for each
   * event; the handler then receives `arg` if it takes an argument.
   */
  listen(arg, handler, register) {
    this.listening = true;
    register(() => this.postEvent(handler, [arg]));
  }

  /** Queues an event; the program runs its handler when it is next idle. */
  postEvent(handler, args) {
    if (this.halted) return;
    this.events.push({ handler, args });
    if (this.waiting) this.onWake?.();
  }

  /**
   * Makes the builtin being called wait for promise. The call ends the time
   * slice without pushing a result; when promise resolves its value is
   * pushed as the call's result and the program continues. If it rejects,
   * onError(vm, message) is called at the call on the next slice (it
   * throws the language's error). onWake tells the Scheduler to run the
   * program again.
   */
  block(promise, onError) {
    const token = {};
    this.blocked = token;
    this.blockedOn = promise.then(
      (value) => { this.unblock(token, { value }); },
      (err) => { this.unblock(token, { error: String(err?.message ?? err), onError }); },
    );
  }

  unblock(token, result) {
    if (this.blocked !== token || this.halted) return;
    this.blocked = null;
    this.blockedOn = null;
    this.resumed = result;
    this.onWake?.();
  }

  /** Applies a finished wait: pushes the call's result, or throws its error. */
  takeResumed() {
    const r = this.resumed;
    this.resumed = null;
    if ('error' in r) r.onError(this, r.error);
    else this.push(r.value);
  }

  /** Runs a queued event's handler: enters it as a call from the HALT at ip. */
  dispatch({ handler, args }) {
    if (handler.proc) {
      this.enter(handler.proc, args.slice(0, handler.proc.arity));
      return;
    }
    const fn = handler.fn;
    const proc = fn instanceof PyBoundMethod ? fn.func.proc : fn.proc;
    const bound = fn instanceof PyBoundMethod ? 1 : 0;
    this.callValue(fn, proc && proc.arity - bound >= 1 ? args : []);
  }

  // ------------------------------------------------------------------ helpers

  push(value) { this.stack.push(value); }

  pop() { return this.stack.pop(); }

  popN(n) { return n === 0 ? [] : this.stack.splice(this.stack.length - n, n); }

  line() { return this.chunk.lines[this.opIp] ?? 0; }

  /** A Crumb runtime error: fatal, with a traceback. */
  fail(message) {
    throw new RuntimeFault(message, { line: this.line(), traceback: this.traceback() });
  }

  /**
   * A failure of a core opcode or of the VM itself. The failure is the same
   * for every language; the chunk's language picks its wording and whether a
   * MiniPy `try` can catch it.
   */
  fault(code, info) {
    const d = describeFault(this.language, code, info);
    if (d.catchable && this.python) throw new PyRaise(this.makeException(d.excType, d.message), this.line());
    throw new RuntimeFault(d.message, {
      line: this.line(), traceback: this.traceback(), excType: d.excType ?? null, code,
    });
  }

  /** Raises a MiniPy exception of the named built-in class. */
  raise(className, message) {
    throw new PyRaise(this.makeException(className, message), this.line());
  }

  makeException(className, message) {
    const classes = this.python.exceptionClasses;
    const inst = new PyInstance(classes[className] ?? classes.Exception);
    inst.attrs.set('args', new PyTuple([message]));
    inst.attrs.set('__msg__', message);
    return inst;
  }

  traceback() {
    return this.frames.map((frame) => ({
      name: frame.proc.name,
      kind: frame.proc.kind,
      line: this.chunk.lines[frame.callIp] ?? 0,
    })).reverse();
  }

  frame() {
    const frame = this.frames[this.frames.length - 1];
    if (!frame) this.fail('no active procedure frame');
    return frame;
  }

  /** Where the innermost try handlers live: the current frame, or module code. */
  context() {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : this.module;
  }

  bool(value, what) {
    if (!isBoolean(value)) {
      this.fault(Fault.BOOL, {
        what, type: this.language === 'python' ? pyTypeName(value) : typeName(value),
      });
    }
    return value;
  }

  // ---------------------------------------------------------------------- run

  /** Runs to completion, blocking for each sleep. It cannot wait for a
   *  Fetch: use runAsync() (or a Scheduler) for programs that fetch. */
  run() {
    while (!this.runSlice()) {
      if (this.waiting) return;   // no one to send events: stop here
      if (this.blocked) {
        this.blocked = null;
        this.fail(this.language === 'python'
          ? 'fetch() needs a program run by the scheduler or runAsync'
          : 'Fetch needs a program run by the scheduler or runAsync');
      }
      const ms = this.takeSleep();
      if (ms !== null) this.sleep(ms);
    }
  }

  /** Runs to completion, waiting (without blocking the thread) for each
   *  sleep and each Fetch. */
  async runAsync() {
    while (!this.runSlice(1000)) {
      if (this.waiting) return;
      if (this.blocked) { await this.blockedOn; continue; }
      const ms = this.takeSleep();
      if (ms !== null) await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  /** Returns and clears a pending sleep request (milliseconds), or null. */
  takeSleep() {
    const ms = this.sleepMs;
    this.sleepMs = null;
    return ms;
  }

  /**
   * Executes up to `budget` instructions, then returns so another program can
   * take a turn. Calling runSlice again resumes exactly where this call
   * stopped. A sleep also ends the slice early; the caller reads it with
   * takeSleep().
   * @param {number} budget  instructions to run in this slice
   * @returns {boolean} true once the program has halted
   */
  runSlice(budget = 10) {
    if (this.halted) return true;
    if (this.blocked) return false;   // still waiting for a Fetch
    let used = 0;
    for (;;) {
      try {
        if (this.resumed) { this.sliceUsed = used; this.takeResumed(); }
        return this.execute(budget, used);
      } catch (signal) {
        if (!(signal instanceof PyRaise)) throw signal;
        used = this.sliceUsed;
        this.unwind(signal);         // lands in a handler, or throws a RuntimeFault
      }
    }
  }

  // ------------------------------------------------------------------ execute

  execute(budget, used) {
    const { code, constants } = this.chunk;

    for (; used < budget; used += 1) {
      this.sliceUsed = used + 1;
      this.steps += 1;
      if (this.steps > this.maxSteps) this.fault(Fault.BUDGET, { maxSteps: this.maxSteps });

      this.opIp = this.ip;
      const op = code[this.ip];
      this.ip += 1;

      switch (op) {
        // ================================================================ core
        case Op.CONST: this.push(constants[code[this.ip]]); this.ip += 1; break;
        case Op.NOTHING: this.push(NOTHING); break;
        case Op.TRUE: this.push(true); break;
        case Op.FALSE: this.push(false); break;
        case Op.POP: this.pop(); break;
        case Op.DUP: this.push(this.stack[this.stack.length - 1]); break;

        case Op.GET_GLOBAL: {
          const slot = code[this.ip];
          const value = this.globals[slot];
          if (value === UNBOUND) this.fault(Fault.NAME, { name: this.chunk.globalNames[slot], local: false });
          this.push(value);
          this.ip += 1;
          break;
        }
        case Op.SET_GLOBAL: this.globals[code[this.ip]] = this.pop(); this.ip += 1; break;
        case Op.GET_LOCAL: {
          const slot = code[this.ip];
          const frame = this.frame();
          const value = frame.slots[slot];
          if (value === UNBOUND) this.fault(Fault.NAME, { name: frame.proc.slotNames?.[slot] ?? `#${slot}`, local: true });
          this.push(value);
          this.ip += 1;
          break;
        }
        case Op.SET_LOCAL: this.frame().slots[code[this.ip]] = this.pop(); this.ip += 1; break;

        case Op.NOT:
          this.push(!this.bool(this.pop(), "operator 'Not'"));
          break;
        case Op.JUMP: this.ip = code[this.ip]; break;
        case Op.JUMP_IF_FALSE: {
          const value = this.bool(this.pop(), 'a condition');
          if (value === false) this.ip = code[this.ip];
          else this.ip += 1;
          break;
        }

        case Op.CALL: {
          const proc = this.chunk.procedures[code[this.ip]];
          const argc = code[this.ip + 1];
          this.ip += 2;
          this.enter(proc, this.popN(argc));
          break;
        }
        case Op.RETURN: this.leave(this.pop()); break;
        case Op.RETURN_NOTHING: this.leave(NOTHING); break;

        case Op.PRINT: {
          const argc = code[this.ip];
          const format = FORMATTERS[code[this.ip + 1]];
          this.ip += 2;
          this.out(this.popN(argc).map(format).join(' '));
          break;
        }
        case Op.TRANSCRIPT: {
          const argc = code[this.ip];
          const format = FORMATTERS[code[this.ip + 1]];
          this.ip += 2;
          this.transcript(this.popN(argc).map(format).join(' '));
          break;
        }
        case Op.HALT:
          if (this.listening) {
            // The end of module code, with event handlers: stay on this
            // HALT and run each event's handler as a call that returns here.
            this.ip = this.opIp;
            this.stack.length = 0;           // a handler's return value
            const event = this.events.shift();
            if (!event) {
              this.waiting = true;
              return false;
            }
            this.waiting = false;
            this.dispatch(event);
            break;
          }
          this.halted = true;
          return true;

        // =============================================================== crumb
        case Op.NEW_ARRAY: {
          const bound = this.pop();
          if (!isNumber(bound) || !Number.isInteger(bound)) {
            this.fail(`an array bound must be a whole Number, got ${isNumber(bound) ? formatNumber(bound) : typeName(bound)}`);
          }
          if (bound < 0) this.fail(`an array bound must be 0 or more, got ${formatNumber(bound)}`);
          this.push(new CrumbArray(bound));
          break;
        }
        case Op.GET_INDEX: {
          const index = this.pop();
          const array = this.pop();
          this.push(array.elements[this.checkIndex(array, index)]);
          break;
        }
        case Op.SET_INDEX: {
          const value = this.pop();
          const index = this.pop();
          const array = this.pop();
          array.elements[this.checkIndex(array, index)] = value;
          break;
        }

        case Op.ADD: case Op.SUB: case Op.MUL: case Op.DIV:
        case Op.IDIV_TRUNC: case Op.MOD_TRUNC: case Op.POW:
          this.arithmetic(op);
          break;
        case Op.NEG: {
          const value = this.pop();
          if (!isNumber(value)) this.fail(`unary '-' expects a Number, got ${typeName(value)}`);
          this.push(-value);
          break;
        }
        case Op.CONCAT: {
          const right = this.pop();
          const left = this.pop();
          if (isArray(left) || isArray(right)) this.fail('operator & cannot convert an Array to a String');
          if (isObject(left) || isObject(right)) {
            this.fail(`operator & cannot convert a ${typeName(isObject(left) ? left : right)} to a String`);
          }
          this.push(toStr(left) + toStr(right));
          break;
        }

        case Op.EQ: case Op.NE: case Op.LT: case Op.LE: case Op.GT: case Op.GE:
          this.compare(op);
          break;

        case Op.CHECK_BOOL:
          this.bool(this.stack[this.stack.length - 1], 'a logical operand');
          break;
        case Op.AND_JUMP: {
          const value = this.bool(this.stack[this.stack.length - 1], "operator 'And'");
          if (value === false) this.ip = code[this.ip];
          else { this.pop(); this.ip += 1; }
          break;
        }
        case Op.OR_JUMP: {
          const value = this.bool(this.stack[this.stack.length - 1], "operator 'Or'");
          if (value === true) this.ip = code[this.ip];
          else { this.pop(); this.ip += 1; }
          break;
        }

        case Op.CALL_BUILTIN: {
          const builtin = BUILTIN_LIST[code[this.ip]];
          const argc = code[this.ip + 1];
          this.ip += 2;
          const args = this.popN(argc);
          let result;
          try {
            result = builtin.fn(args, this);
          } catch (err) {
            if (err instanceof BuiltinError) this.fail(err.message);
            throw err;
          }
          if (this.blocked) return false;             // wait for Fetch; its result is pushed later
          this.push(result);
          if (this.sleepMs !== null) return false;   // yield for Sleep
          break;
        }
        case Op.NEW_OBJECT: {
          const index = code[this.ip];
          const argc = code[this.ip + 1];
          this.ip += 2;
          this.push(this.crumbCall(() => newObject(this, index, this.popN(argc))));
          break;
        }
        case Op.CALL_METHOD: {
          const name = constants[code[this.ip]];
          const argc = code[this.ip + 1];
          this.ip += 2;
          const args = this.popN(argc);
          const obj = this.pop();
          this.push(this.crumbCall(() => callMethod(this, obj, name, args)));
          break;
        }
        case Op.NO_RETURN:
          this.fail(`Function '${this.frame().proc.name}' ended without returning a value`);
          break;

        // ============================================================== python
        case Op.TRUTHY: this.push(isTruthy(this.pop())); break;
        case Op.JUMP_IF_FALSY_KEEP:
          if (!isTruthy(this.stack[this.stack.length - 1])) this.ip = code[this.ip];
          else { this.pop(); this.ip += 1; }
          break;
        case Op.JUMP_IF_TRUTHY_KEEP:
          if (isTruthy(this.stack[this.stack.length - 1])) this.ip = code[this.ip];
          else { this.pop(); this.ip += 1; }
          break;

        case Op.PY_ADD: { const r = this.pop(); this.push(py.add(this, this.pop(), r)); break; }
        case Op.PY_SUB: { const r = this.pop(); this.push(py.sub(this, this.pop(), r)); break; }
        case Op.PY_MUL: { const r = this.pop(); this.push(py.mul(this, this.pop(), r)); break; }
        case Op.PY_TRUEDIV: { const r = this.pop(); this.push(py.truediv(this, this.pop(), r)); break; }
        case Op.PY_FLOORDIV: { const r = this.pop(); this.push(py.floordiv(this, this.pop(), r)); break; }
        case Op.PY_MOD: { const r = this.pop(); this.push(py.mod(this, this.pop(), r)); break; }
        case Op.PY_POW: { const r = this.pop(); this.push(py.pow(this, this.pop(), r)); break; }
        case Op.PY_NEG: this.push(py.neg(this, this.pop())); break;
        case Op.PY_POS: this.push(py.pos(this, this.pop())); break;
        case Op.PY_STR: this.push(pyStr(this.pop())); break;

        case Op.PY_EQ: { const r = this.pop(); this.push(py.pyEquals(this.pop(), r)); break; }
        case Op.PY_NE: { const r = this.pop(); this.push(!py.pyEquals(this.pop(), r)); break; }
        case Op.PY_LT: { const r = this.pop(); this.push(py.order(this, '<', this.pop(), r)); break; }
        case Op.PY_LE: { const r = this.pop(); this.push(py.order(this, '<=', this.pop(), r)); break; }
        case Op.PY_GT: { const r = this.pop(); this.push(py.order(this, '>', this.pop(), r)); break; }
        case Op.PY_GE: { const r = this.pop(); this.push(py.order(this, '>=', this.pop(), r)); break; }
        case Op.PY_IS: { const r = this.pop(); this.push(py.pyIs(this.pop(), r)); break; }
        case Op.PY_IS_NOT: { const r = this.pop(); this.push(!py.pyIs(this.pop(), r)); break; }
        case Op.PY_IN: { const r = this.pop(); this.push(py.contains(this, this.pop(), r)); break; }
        case Op.PY_NOT_IN: { const r = this.pop(); this.push(!py.contains(this, this.pop(), r)); break; }

        case Op.BUILD_LIST: this.push(this.popN(code[this.ip])); this.ip += 1; break;
        case Op.BUILD_TUPLE: this.push(new PyTuple(this.popN(code[this.ip]))); this.ip += 1; break;
        case Op.BUILD_DICT: {
          const flat = this.popN(code[this.ip] * 2);
          this.ip += 1;
          const dict = new PyDict();
          for (let i = 0; i < flat.length; i += 2) {
            if (PyDict.keyOf(flat[i]) === null) this.raise('TypeError', `unhashable type: '${pyTypeName(flat[i])}'`);
            dict.set(flat[i], flat[i + 1]);
          }
          this.push(dict);
          break;
        }
        case Op.LIST_APPEND: {
          // Stack: [..., list, iterator, value]: the iterator sits between the
          // list being built and the element just computed.
          const value = this.pop();
          this.stack[this.stack.length - 2].push(value);
          break;
        }
        case Op.UNPACK_SEQUENCE: {
          const n = code[this.ip];
          this.ip += 1;
          const seq = py.toSequenceArray(this, this.pop());
          if (seq.length !== n) {
            this.raise('ValueError', seq.length > n
              ? `too many values to unpack (expected ${n})`
              : `not enough values to unpack (expected ${n}, got ${seq.length})`);
          }
          for (let i = seq.length - 1; i >= 0; i -= 1) this.push(seq[i]);
          break;
        }

        case Op.GET_ITEM: { const idx = this.pop(); this.push(py.getItem(this, this.pop(), idx)); break; }
        case Op.SET_ITEM: {
          const value = this.pop();
          const idx = this.pop();
          py.setItem(this, this.pop(), idx, value);
          break;
        }
        case Op.DEL_ITEM: { const idx = this.pop(); py.delItem(this, this.pop(), idx); break; }
        case Op.GET_SLICE: {
          const step = this.pop();
          const stop = this.pop();
          const start = this.pop();
          this.push(py.getSlice(this, this.pop(), start, stop, step));
          break;
        }
        case Op.GET_ATTR: {
          const name = constants[code[this.ip]];
          this.ip += 1;
          this.push(py.getAttr(this, this.pop(), name));
          break;
        }
        case Op.SET_ATTR: {
          const name = constants[code[this.ip]];
          this.ip += 1;
          const value = this.pop();
          py.setAttr(this, this.pop(), name, value);
          break;
        }

        case Op.CALL_VALUE: {
          const argc = code[this.ip];
          this.ip += 1;
          const args = this.popN(argc);
          this.callValue(this.pop(), args);
          if (this.blocked) return false;            // wait for fetch()
          if (this.sleepMs !== null) return false;   // yield for sleep()
          break;
        }
        case Op.MAKE_FUNCTION: {
          const index = code[this.ip];
          const defaults = this.popN(code[this.ip + 1]);
          this.ip += 2;
          const proc = this.chunk.procedures[index];
          this.push(new PyFunction(proc.name, proc, index, defaults));
          break;
        }
        case Op.MAKE_CLASS: {
          const proc = this.chunk.procedures[code[this.ip]];
          const name = constants[code[this.ip + 1]];
          this.ip += 2;
          const base = this.pop();
          if (base !== NOTHING && !(base instanceof PyClass)) this.raise('TypeError', 'a base must be a class');
          const frame = this.enter(proc, []);
          frame.classBody = { name, base };
          break;
        }

        case Op.GET_ITER: this.push(py.makeIterator(this, this.pop())); break;
        case Op.FOR_ITER: {
          const next = this.stack[this.stack.length - 1].next();
          if (next.done) { this.pop(); this.ip = code[this.ip]; } else { this.push(next.value); this.ip += 1; }
          break;
        }

        case Op.SETUP_EXCEPT: case Op.SETUP_FINALLY: {
          const ctx = this.context();
          (ctx.handlers ??= []).push({
            kind: op === Op.SETUP_EXCEPT ? 'except' : 'finally',
            addr: code[this.ip],
            depth: this.stack.length,
          });
          this.ip += 1;
          break;
        }
        case Op.POP_EXCEPT: this.context().handlers.pop(); break;
        case Op.POP_FINALLY: {
          const ctx = this.context();
          ctx.handlers.pop();
          (ctx.pending ??= []).push(null);          // the body finished normally
          break;
        }
        case Op.END_FINALLY: {
          const pending = this.context().pending.pop();
          if (pending === null) { this.currentException = null; break; }
          if (pending.kind === 'raise') throw new PyRaise(pending.value, this.line());
          this.leave(pending.value);                // a return waiting on this finally
          break;
        }
        case Op.MATCH_EXCEPT: {
          const n = code[this.ip];
          const target = code[this.ip + 1];
          this.ip += 2;
          const classes = this.popN(n);
          const exc = this.stack[this.stack.length - 1];
          const matches = n === 0 || classes.some((c) => this.exceptionMatches(exc, c));
          if (!matches) this.ip = target;
          break;
        }
        case Op.END_EXCEPT: this.currentException = null; break;
        case Op.RAISE: {
          const withValue = code[this.ip] === 1;
          this.ip += 1;
          if (!withValue) {
            if (!this.currentException) this.raise('RuntimeError', 'No active exception to reraise');
            throw new PyRaise(this.currentException, this.line());
          }
          let value = this.pop();
          if (value instanceof PyClass && value.isSubclassOf(this.python.exceptionClasses.Exception)) {
            value = this.instantiate(value, []);
          }
          if (!(value instanceof PyInstance && value.cls.isSubclassOf(this.python.exceptionClasses.Exception))) {
            this.raise('TypeError', 'exceptions must derive from Exception');
          }
          throw new PyRaise(value, this.line());
        }

        default:
          this.fault(Fault.OPCODE, { op: `${op} (${OP_NAMES[op] ?? '?'})`, ip: this.opIp });
      }
    }
    return false;
  }

  // -------------------------------------------------------------------- calls

  /** Pushes a frame for `proc` and jumps to it. Shared by CALL, CALL_VALUE
   *  and MAKE_CLASS. */
  enter(proc, args, result = undefined) {
    if (this.frames.length >= this.maxDepth) {
      this.fault(Fault.STACK, { maxDepth: this.maxDepth, name: proc.name });
    }
    const slots = new Array(proc.slotCount).fill(this.slotFill);
    for (let i = 0; i < args.length; i += 1) slots[i] = args[i];
    const frame = {
      proc,
      slots,
      returnIp: this.ip,
      callIp: this.opIp,
      stackBase: this.stack.length,
      handlers: null,       // try blocks open in this frame
      pending: null,        // what each finally body resumes afterwards
      result,               // replaces the return value (a constructor call)
      classBody: null,      // set by MAKE_CLASS
    };
    this.frames.push(frame);
    this.ip = proc.entry;
    return frame;
  }

  /**
   * Leaves the current frame with `value`. A finally block still open in the
   * frame runs first: the return waits on it and END_FINALLY resumes it.
   */
  leave(value) {
    const frame = this.frame();
    while (frame.handlers && frame.handlers.length > 0) {
      const handler = frame.handlers.pop();
      if (handler.kind === 'finally') {
        this.stack.length = handler.depth;
        (frame.pending ??= []).push({ kind: 'return', value });
        this.ip = handler.addr;
        return;
      }
    }
    this.frames.pop();
    this.stack.length = frame.stackBase;
    let result = value;
    if (frame.classBody) result = this.buildClass(frame);
    else if (frame.result !== undefined) result = frame.result;
    this.push(result);
    this.ip = frame.returnIp;
  }

  /** CALL_VALUE: call whatever MiniPy value is being called. */
  callValue(callee, args) {
    if (callee instanceof PyFunction) { this.callFunction(callee, args); return; }
    if (callee instanceof PyBuiltinFunction) {
      const result = callee.fn(this, args);
      if (!this.blocked) this.push(result);   // a fetch() pushes its result when it arrives
      return;
    }
    if (callee instanceof PyBoundMethod) { this.callValue(callee.func, [callee.instance, ...args]); return; }
    if (callee instanceof PyClass) {
      const init = callee.findMethod('__init__');
      const inst = new PyInstance(callee);
      if (init instanceof PyFunction) {
        this.callFunction(init, [inst, ...args], inst);     // returns the instance
        return;
      }
      this.push(this.instantiate(callee, args, inst));
      return;
    }
    this.raise('TypeError', `'${pyTypeName(callee)}' object is not callable`);
  }

  callFunction(fn, args, result = undefined) {
    const { proc, defaults } = fn;
    const required = proc.arity - defaults.length;
    if (args.length < required || args.length > proc.arity) {
      const takes = defaults.length ? `from ${required} to ${proc.arity}` : `${proc.arity}`;
      this.raise('TypeError', `${fn.name}() takes ${takes} positional argument${proc.arity === 1 ? '' : 's'} but ${args.length} ${args.length === 1 ? 'was' : 'were'} given`);
    }
    const full = args.slice();
    for (let i = args.length; i < proc.arity; i += 1) full.push(defaults[i - required]);
    this.enter(proc, full, result);
  }

  /** An instance of a class with no __init__ of its own. */
  instantiate(cls, args, inst = new PyInstance(cls)) {
    if (cls.isSubclassOf(this.python.exceptionClasses.Exception)) {
      // Exception and its subclasses behave like BaseException.__init__(*args).
      inst.attrs.set('args', new PyTuple(args));
      if (args.length > 0) inst.attrs.set('__msg__', args[0]);
    } else if (args.length > 0) {
      this.raise('TypeError', `${cls.name}() takes no arguments`);
    }
    return inst;
  }

  buildClass(frame) {
    const cls = new PyClass(frame.classBody.name, frame.classBody.base);
    frame.proc.slotNames.forEach((name, slot) => {
      const value = frame.slots[slot];
      if (value !== UNBOUND && !name.startsWith('$')) cls.methods.set(name, value);
    });
    return cls;
  }

  exceptionMatches(exc, cls) {
    if (cls instanceof PyTuple) return cls.items.some((c) => this.exceptionMatches(exc, c));
    return cls instanceof PyClass && exc instanceof PyInstance && exc.cls.isSubclassOf(cls);
  }

  // --------------------------------------------------------------- unwinding

  /**
   * Finds the handler for a MiniPy exception: the innermost open try, in this
   * frame or a caller's. Frames without one are discarded and recorded in the
   * traceback. With no handler anywhere the program ends with a RuntimeFault.
   */
  unwind(signal) {
    for (;;) {
      const ctx = this.context();
      if (ctx.handlers && ctx.handlers.length > 0) {
        const handler = ctx.handlers.pop();
        this.stack.length = handler.depth;
        this.currentException = signal.value;
        if (handler.kind === 'except') this.push(signal.value);
        else (ctx.pending ??= []).push({ kind: 'raise', value: signal.value });
        this.ip = handler.addr;
        return;
      }
      if (this.frames.length === 0) throw this.uncaught(signal);
      const frame = this.frames.pop();
      signal.traceback.push({
        name: frame.proc.name,
        kind: frame.proc.kind,
        line: this.chunk.lines[frame.callIp] ?? 0,
      });
      this.stack.length = frame.stackBase;
    }
  }

  uncaught(signal) {
    const exc = signal.value;
    const excType = exc instanceof PyInstance ? exc.cls.name : pyTypeName(exc);
    const message = exc instanceof PyInstance && exc.attrs.has('__msg__')
      ? pyStr(exc.attrs.get('__msg__'))
      : '';
    this.halted = true;
    return new RuntimeFault(message, { line: signal.line, traceback: signal.traceback, excType });
  }

  // -------------------------------------------------------------- crumb ops

  /** Runs a Crumb built-in's body, turning a BuiltinError into a runtime error. */
  crumbCall(body) {
    try {
      return body();
    } catch (err) {
      if (err instanceof BuiltinError) this.fail(err.message);
      throw err;
    }
  }

  checkIndex(array, index) {
    if (!isArray(array)) this.fail(`only an Array can be subscripted, got ${typeName(array)}`);
    if (!isNumber(index) || !Number.isInteger(index)) {
      this.fail(`an array index must be a whole Number, got ${isNumber(index) ? formatNumber(index) : typeName(index)}`);
    }
    if (index < 0 || index > array.bound) {
      this.fail(`index ${formatNumber(index)} is out of range 0..${array.bound}`);
    }
    return index;
  }

  numbers(op, left, right) {
    if (!isNumber(left) || !isNumber(right)) {
      this.fail(`operator ${op} expects Number, Number but got ${typeName(left)}, ${typeName(right)}`);
    }
  }

  arithmetic(op) {
    const right = this.pop();
    const left = this.pop();
    switch (op) {
      case Op.ADD: this.numbers('+', left, right); this.push(left + right); return;
      case Op.SUB: this.numbers('-', left, right); this.push(left - right); return;
      case Op.MUL: this.numbers('*', left, right); this.push(left * right); return;
      case Op.POW: this.numbers('^', left, right); this.push(left ** right); return;
      case Op.DIV:
        this.numbers('/', left, right);
        if (right === 0) this.fail('division by zero');
        this.push(left / right);
        return;
      case Op.IDIV_TRUNC:
        this.numbers('\\', left, right);
        if (right === 0) this.fail('division by zero');
        this.push(Math.trunc(left / right));
        return;
      case Op.MOD_TRUNC:
        this.numbers('Mod', left, right);
        if (right === 0) this.fail('division by zero');
        this.push(left % right);            // JS % takes the sign of the left
        return;
      default:
        this.fail(`not an arithmetic opcode: ${op}`);
    }
  }

  compare(op) {
    const right = this.pop();
    const left = this.pop();
    const symbol = { [Op.EQ]: '=', [Op.NE]: '<>', [Op.LT]: '<', [Op.LE]: '<=', [Op.GT]: '>', [Op.GE]: '>=' }[op];

    if (ORDERED.has(op)) {
      // Section 8: only Numbers and Strings have an order.
      const ok = (isNumber(left) && isNumber(right)) || (isString(left) && isString(right));
      if (!ok) {
        this.fail(`operator ${symbol} expects two Numbers or two Strings, got ${typeName(left)}, ${typeName(right)}`);
      }
      switch (op) {
        case Op.LT: this.push(left < right); return;
        case Op.LE: this.push(left <= right); return;
        case Op.GT: this.push(left > right); return;
        default: this.push(left >= right); return;
      }
    }

    // = and <> also accept Nothing on either side (section 3), and compare
    // arrays and objects by identity; any two objects may be compared.
    // Otherwise both sides must have the same type.
    const sameType = typeName(left) === typeName(right) || (isObject(left) && isObject(right));
    const eitherNothing = left === NOTHING || right === NOTHING;
    if (!sameType && !eitherNothing) {
      this.fail(`operator ${symbol} expects the same type on both sides, got ${typeName(left)}, ${typeName(right)}`);
    }
    const equal = left === right;
    this.push(op === Op.EQ ? equal : !equal);
  }
}

/**
 * Runs a compiled chunk to completion.
 * @returns {{output: string[], error: RuntimeFault|null, steps: number}}
 */
export function run(chunk, options = {}) {
  const output = [];
  const collect = options.out ?? ((text) => output.push(text));
  const vm = new VM(chunk, { ...options, out: collect });
  try {
    vm.run();
    return { output, error: null, steps: vm.steps };
  } catch (err) {
    if (err instanceof RuntimeFault) return { output, error: err, steps: vm.steps };
    throw err;
  }
}

/**
 * Runs a compiled chunk to completion, waiting for Sleep and Fetch without
 * blocking. Resolves to the same result as run().
 */
export async function runAsync(chunk, options = {}) {
  const output = [];
  const collect = options.out ?? ((text) => output.push(text));
  const vm = new VM(chunk, { ...options, out: collect });
  try {
    await vm.runAsync();
    return { output, error: null, steps: vm.steps };
  } catch (err) {
    if (err instanceof RuntimeFault) return { output, error: err, steps: vm.steps };
    throw err;
  }
}
