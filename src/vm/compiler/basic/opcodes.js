// Crumb bytecode. A stack machine: every instruction is one opcode number
// followed by a fixed count of inline operands in the same flat array.

let next = 0;
const op = () => next++;

export const Op = Object.freeze({
  // --- stack / literals -----------------------------------------------------
  CONST: op(),          // k        push constants[k]
  NOTHING: op(),        //          push Nothing
  TRUE: op(),
  FALSE: op(),
  POP: op(),

  // --- variables ------------------------------------------------------------
  GET_GLOBAL: op(),     // slot
  SET_GLOBAL: op(),     // slot     pops the value
  GET_LOCAL: op(),      // slot
  SET_LOCAL: op(),      // slot     pops the value

  // --- arrays ---------------------------------------------------------------
  NEW_ARRAY: op(),      //          pops bound n, pushes an array of 0..n
  GET_INDEX: op(),      //          pops index, array
  SET_INDEX: op(),      //          pops value, index, array

  // --- arithmetic (section 8, levels 2-5) -----------------------------------
  ADD: op(), SUB: op(), MUL: op(), DIV: op(), IDIV: op(), MOD: op(), POW: op(),
  NEG: op(),

  // --- concatenation (level 6) ---------------------------------------------
  CONCAT: op(),

  // --- comparison (level 7) -------------------------------------------------
  EQ: op(), NE: op(), LT: op(), LE: op(), GT: op(), GE: op(),

  // --- logic (levels 8-10) --------------------------------------------------
  NOT: op(),
  CHECK_BOOL: op(),     //          asserts top of stack is Boolean, leaves it
  AND_JUMP: op(),       // target   top False -> jump keeping it, else pop
  OR_JUMP: op(),        // target   top True  -> jump keeping it, else pop

  // --- control flow ---------------------------------------------------------
  JUMP: op(),           // target
  JUMP_IF_FALSE: op(),  // target   pops; the value must be Boolean

  // --- calls ----------------------------------------------------------------
  CALL: op(),           // proc, argc
  CALL_BUILTIN: op(),   // builtin, argc
  RETURN: op(),         //          pops the result
  RETURN_NOTHING: op(),
  NO_RETURN: op(),      //          reached the End of a Function: runtime error

  // --- io / halt ------------------------------------------------------------
  PRINT: op(),          // argc
  HALT: op(),
});

/** opcode -> number of inline operands. */
export const OPERANDS = Object.freeze({
  [Op.CONST]: 1,
  [Op.NOTHING]: 0, [Op.TRUE]: 0, [Op.FALSE]: 0, [Op.POP]: 0,
  [Op.GET_GLOBAL]: 1, [Op.SET_GLOBAL]: 1, [Op.GET_LOCAL]: 1, [Op.SET_LOCAL]: 1,
  [Op.NEW_ARRAY]: 0, [Op.GET_INDEX]: 0, [Op.SET_INDEX]: 0,
  [Op.ADD]: 0, [Op.SUB]: 0, [Op.MUL]: 0, [Op.DIV]: 0, [Op.IDIV]: 0,
  [Op.MOD]: 0, [Op.POW]: 0, [Op.NEG]: 0, [Op.CONCAT]: 0,
  [Op.EQ]: 0, [Op.NE]: 0, [Op.LT]: 0, [Op.LE]: 0, [Op.GT]: 0, [Op.GE]: 0,
  [Op.NOT]: 0, [Op.CHECK_BOOL]: 0, [Op.AND_JUMP]: 1, [Op.OR_JUMP]: 1,
  [Op.JUMP]: 1, [Op.JUMP_IF_FALSE]: 1,
  [Op.CALL]: 2, [Op.CALL_BUILTIN]: 2,
  [Op.RETURN]: 0, [Op.RETURN_NOTHING]: 0, [Op.NO_RETURN]: 0,
  [Op.PRINT]: 1, [Op.HALT]: 0,
});

/** opcode -> mnemonic, for the disassembler and error messages. */
export const OP_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(Op).map(([name, code]) => [code, name])),
);

/** Crumb operator token -> opcode, for the compiler's binary-expression case. */
export const BINARY_OPS = Object.freeze({
  '+': Op.ADD, '-': Op.SUB, '*': Op.MUL, '/': Op.DIV, '\\': Op.IDIV,
  Mod: Op.MOD, '^': Op.POW, '&': Op.CONCAT,
  '=': Op.EQ, '<>': Op.NE, '<': Op.LT, '<=': Op.LE, '>': Op.GT, '>=': Op.GE,
});
