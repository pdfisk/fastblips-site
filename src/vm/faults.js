// Runtime faults: what the VM raises when an instruction cannot proceed.
//
// A language-specific opcode reports its errors in its own language's words:
// only one language ever runs it. A core opcode is shared, so its failures
// are identified by a code, and the wording, the exception class and whether
// the program can catch it come from the language that compiled the chunk.
// The failure itself is the same in both languages.

/** Failure codes raised by core opcodes and by the VM itself. */
export const Fault = Object.freeze({
  NAME: 'NAME',       // read of an unbound slot
  BOOL: 'BOOL',       // NOT / JUMP_IF_FALSE given a non-Boolean
  BUDGET: 'BUDGET',   // maxSteps exhausted
  STACK: 'STACK',     // maxDepth frames exceeded
  OPCODE: 'OPCODE',   // an opcode this VM does not know
});

/**
 * code -> (info) -> { message, excType, catchable }
 *   excType   MiniPy's exception class name; unused for Crumb
 *   catchable whether a MiniPy `try` can handle it. Crumb has no try, so every
 *             Crumb runtime error is fatal (spec section 11).
 */
const WORDING = {
  crumb: {
    NAME: ({ name }) => ({ message: `'${name}' has no value` }),
    BOOL: ({ what, type }) => ({ message: `${what} expects a Boolean, got ${type}` }),
    BUDGET: ({ maxSteps }) => ({
      message: `instruction budget of ${maxSteps} exhausted: the program may not terminate`,
    }),
    STACK: ({ maxDepth, name }) => ({
      message: `call stack exhausted at ${maxDepth} frames: '${name}' may not terminate`,
    }),
    OPCODE: ({ op, ip }) => ({ message: `unknown opcode ${op} at ${ip}` }),
  },
  python: {
    NAME: ({ name, local }) => ({
      excType: 'NameError',
      catchable: true,
      message: local
        ? `cannot access local variable '${name}' where it is not associated with a value`
        : `name '${name}' is not defined`,
    }),
    BOOL: ({ type }) => ({ excType: 'TypeError', catchable: true, message: `expected a bool, got '${type}'` }),
    BUDGET: ({ maxSteps }) => ({ excType: 'Fatal', message: `instruction budget of ${maxSteps} exceeded` }),
    STACK: () => ({ excType: 'RecursionError', message: 'maximum recursion depth exceeded' }),
    OPCODE: ({ op, ip }) => ({ excType: 'SystemError', message: `unknown opcode ${op} at ${ip}` }),
  },
};

export function describeFault(language, code, info) {
  const table = WORDING[language] ?? WORDING.crumb;
  return { catchable: false, ...table[code](info) };
}

/**
 * A runtime error that stopped the program: a Crumb runtime error (spec
 * section 11), or a MiniPy exception that nothing caught.
 *
 *   line       source line of the failing instruction
 *   traceback  call sites, innermost first: [{ name, kind, line }]
 *   excType    MiniPy only: the exception class name
 */
export class RuntimeFault extends Error {
  constructor(message, { line = 0, column = 0, traceback = [], excType = null, code = null } = {}) {
    super(message);
    this.name = 'RuntimeFault';
    this.line = line;
    this.column = column;
    this.phase = 'runtime';
    this.traceback = traceback;
    this.excType = excType;
    this.code = code;
  }
}
