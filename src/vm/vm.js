// The Crumb virtual machine: a stack machine over the bytecode of opcodes.js.
//
// Types are checked here, at the instruction, because Crumb is dynamically
// typed and does no coercion (spec section 3). Every failure becomes a
// positioned runtime error with a traceback (section 11).

import { Op, OP_NAMES } from './opcodes.js';
import {
  NOTHING, CrumbArray, typeName, toStr, formatNumber,
  isNumber, isString, isBoolean, isArray,
} from './values.js';
import { BUILTIN_LIST, BuiltinError } from './builtins.js';
import { CrumbError } from './diagnostics.js';

export class CrumbRuntimeError extends CrumbError {
  constructor(message, { line, column = 0, traceback = [] } = {}) {
    super(message, { line, column, phase: 'runtime' });
    this.name = 'CrumbRuntimeError';
    this.traceback = traceback;
  }
}

const ORDERED = new Set([Op.LT, Op.LE, Op.GT, Op.GE]);

export class VM {
  constructor(chunk, {
    out = (text) => process.stdout.write(`${text}\n`),
    maxDepth = 10000,
    maxSteps = Infinity,
    random = Math.random,
  } = {}) {
    this.chunk = chunk;
    this.out = out;
    this.maxDepth = maxDepth;
    this.maxSteps = maxSteps;
    this.random = random;

    this.globals = new Array(chunk.globalCount).fill(NOTHING);
    this.stack = [];
    this.frames = [];
    this.ip = chunk.entry;
    this.opIp = chunk.entry;
    this.steps = 0;
    this.halted = false;
  }

  // ------------------------------------------------------------------ helpers

  push(value) { this.stack.push(value); }

  pop() { return this.stack.pop(); }

  fail(message) {
    throw new CrumbRuntimeError(message, {
      line: this.chunk.lines[this.opIp] ?? 0,
      traceback: this.traceback(),
    });
  }

  traceback() {
    return this.frames.map((frame) => ({
      name: frame.proc.name,
      kind: frame.proc.kind,
      line: this.chunk.lines[frame.callIp] ?? 0,
    })).reverse();
  }

  // --- operand checks --------------------------------------------------------

  numbers(op, left, right) {
    if (!isNumber(left) || !isNumber(right)) {
      this.fail(`operator ${op} expects Number, Number but got ${typeName(left)}, ${typeName(right)}`);
    }
  }

  bool(value, what) {
    if (!isBoolean(value)) {
      this.fail(`${what} expects a Boolean, got ${typeName(value)}`);
    }
    return value;
  }

  // ---------------------------------------------------------------------- run

  run() {
    this.runSlice();
  }

  // ---------------------------------------------------------------- runSlice

  /**
   * Executes up to `budget` instructions, then returns so another program can
   * take a turn. All execution state (ip, stack, frames, globals) lives on the
   * VM, so calling runSlice again resumes exactly where this call stopped.
   * @param {number} budget  instructions to run in this slice
   * @returns {boolean} true once the program has halted
   */
  runSlice(budget = Infinity) {
    if (this.halted) return true;
    const { code, constants } = this.chunk;

    for (let used = 0; used < budget; used += 1) {
      this.steps += 1;
      if (this.steps > this.maxSteps) {
        this.fail(`instruction budget of ${this.maxSteps} exhausted: the program may not terminate`);
      }

      this.opIp = this.ip;
      const op = code[this.ip];
      this.ip += 1;

      switch (op) {
        // --- stack / literals ------------------------------------------------
        case Op.CONST: this.push(constants[code[this.ip]]); this.ip += 1; break;
        case Op.NOTHING: this.push(NOTHING); break;
        case Op.TRUE: this.push(true); break;
        case Op.FALSE: this.push(false); break;
        case Op.POP: this.pop(); break;

        // --- variables -------------------------------------------------------
        case Op.GET_GLOBAL: this.push(this.globals[code[this.ip]]); this.ip += 1; break;
        case Op.SET_GLOBAL: this.globals[code[this.ip]] = this.pop(); this.ip += 1; break;
        case Op.GET_LOCAL: this.push(this.frame().slots[code[this.ip]]); this.ip += 1; break;
        case Op.SET_LOCAL: this.frame().slots[code[this.ip]] = this.pop(); this.ip += 1; break;

        // --- arrays ----------------------------------------------------------
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

        // --- arithmetic ------------------------------------------------------
        case Op.ADD: case Op.SUB: case Op.MUL: case Op.DIV:
        case Op.IDIV: case Op.MOD: case Op.POW:
          this.arithmetic(op);
          break;
        case Op.NEG: {
          const value = this.pop();
          if (!isNumber(value)) this.fail(`unary '-' expects a Number, got ${typeName(value)}`);
          this.push(-value);
          break;
        }

        // --- concatenation ---------------------------------------------------
        case Op.CONCAT: {
          const right = this.pop();
          const left = this.pop();
          if (isArray(left) || isArray(right)) {
            this.fail(`operator & cannot convert an Array to a String`);
          }
          this.push(toStr(left) + toStr(right));
          break;
        }

        // --- comparison ------------------------------------------------------
        case Op.EQ: case Op.NE: case Op.LT: case Op.LE: case Op.GT: case Op.GE:
          this.compare(op);
          break;

        // --- logic -----------------------------------------------------------
        case Op.NOT:
          this.push(!this.bool(this.pop(), "operator 'Not'"));
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

        // --- control flow ----------------------------------------------------
        case Op.JUMP: this.ip = code[this.ip]; break;
        case Op.JUMP_IF_FALSE: {
          const value = this.bool(this.pop(), 'a condition');
          if (value === false) this.ip = code[this.ip];
          else this.ip += 1;
          break;
        }

        // --- calls -----------------------------------------------------------
        case Op.CALL: {
          const index = code[this.ip];
          const argc = code[this.ip + 1];
          const returnIp = this.ip + 2;
          const proc = this.chunk.procedures[index];
          if (this.frames.length >= this.maxDepth) {
            this.fail(`call stack exhausted at ${this.maxDepth} frames: '${proc.name}' may not terminate`);
          }
          const slots = new Array(proc.slotCount).fill(NOTHING);
          for (let i = argc - 1; i >= 0; i -= 1) slots[i] = this.pop();
          this.frames.push({
            proc, slots, returnIp, callIp: this.opIp, stackBase: this.stack.length,
          });
          this.ip = proc.entry;
          break;
        }
        case Op.CALL_BUILTIN: {
          const builtin = BUILTIN_LIST[code[this.ip]];
          const argc = code[this.ip + 1];
          this.ip += 2;
          const args = argc === 0 ? [] : this.stack.splice(this.stack.length - argc, argc);
          try {
            this.push(builtin.fn(args, this));
          } catch (err) {
            if (err instanceof BuiltinError) this.fail(err.message);
            throw err;
          }
          break;
        }
        case Op.RETURN: {
          const value = this.pop();
          const frame = this.frames.pop();
          this.stack.length = frame.stackBase;
          this.push(value);
          this.ip = frame.returnIp;
          break;
        }
        case Op.RETURN_NOTHING: {
          const frame = this.frames.pop();
          this.stack.length = frame.stackBase;
          this.push(NOTHING);
          this.ip = frame.returnIp;
          break;
        }
        case Op.NO_RETURN: {
          const frame = this.frame();
          this.fail(`Function '${frame.proc.name}' ended without returning a value`);
          break;
        }

        // --- io / halt -------------------------------------------------------
        case Op.PRINT: {
          const argc = code[this.ip];
          this.ip += 1;
          const args = argc === 0 ? [] : this.stack.splice(this.stack.length - argc, argc);
          this.out(args.map(toStr).join(' '));
          break;
        }
        case Op.HALT:
          this.halted = true;
          return true;

        default:
          this.fail(`unknown opcode ${op} (${OP_NAMES[op] ?? '?'}) at ${this.opIp}`);
      }
    }
    return false;
  }

  frame() {
    const frame = this.frames[this.frames.length - 1];
    if (!frame) this.fail('no active procedure frame');
    return frame;
  }

  checkIndex(array, index) {
    if (!isArray(array)) {
      this.fail(`only an Array can be subscripted, got ${typeName(array)}`);
    }
    if (!isNumber(index) || !Number.isInteger(index)) {
      this.fail(`an array index must be a whole Number, got ${isNumber(index) ? formatNumber(index) : typeName(index)}`);
    }
    if (index < 0 || index > array.bound) {
      this.fail(`index ${formatNumber(index)} is out of range 0..${array.bound}`);
    }
    return index;
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
      case Op.IDIV:
        this.numbers('\\', left, right);
        if (right === 0) this.fail('division by zero');
        this.push(Math.trunc(left / right));
        return;
      case Op.MOD:
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
    // arrays by identity. Otherwise both sides must have the same type.
    const sameType = typeName(left) === typeName(right);
    const eitherNothing = left === NOTHING || right === NOTHING;
    if (!sameType && !eitherNothing) {
      this.fail(`operator ${symbol} expects the same type on both sides, got ${typeName(left)}, ${typeName(right)}`);
    }
    const equal = left === right;
    this.push(op === Op.EQ ? equal : !equal);
  }
}

/**
 * Runs a compiled chunk.
 * @returns {{output: string[], error: CrumbRuntimeError|null, steps: number}}
 */
export function run(chunk, options = {}) {
  const output = [];
  const collect = options.out ?? ((text) => output.push(text));
  const vm = new VM(chunk, { ...options, out: collect });
  try {
    vm.run();
    return { output, error: null, steps: vm.steps };
  } catch (err) {
    if (err instanceof CrumbRuntimeError) return { output, error: err, steps: vm.steps };
    throw err;
  }
}
