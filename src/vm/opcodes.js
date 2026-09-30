// The one instruction set. Crumb and MiniPy both compile to it and both run on
// src/vm/vm.js.
//
// Encoding: a chunk's `code` is a flat array of numbers. Each instruction is
// an opcode followed by a fixed number of inline operands. Jump targets are
// absolute addresses into `code`.
//
// Every opcode belongs to one section:
//
//   core    Meaning does not depend on the source language: moving values
//           between the stack and the slots, jumps, calls, returns and
//           output. Either front end may emit these.
//   crumb   Crumb's value rules: no coercion, Boolean-only logic, one Number
//           type, fixed arrays.
//   python  MiniPy's value rules: truthiness, the int/float numeric tower,
//           dynamic `+`, lists/tuples/dicts, objects, iteration, exceptions.
//
// Rule: an opcode means one thing. Where the two languages disagree about an
// operator, each meaning gets its own opcode. The language that compiled a
// chunk never changes what an opcode does. (It only picks the wording of a
// shared op's error message: see faults.js.)
//
// Operand kinds, used by the disassembler and by the table checks in the
// tests:
//   const   index into chunk.constants
//   slot    global or local slot number
//   target  jump target (absolute address)
//   proc    index into chunk.procedures
//   builtin index into Crumb's built-in table
//   class   index into Crumb's class table (runtime/crumb-objects.js)
//   count   a number of stack values
//   fmt     a value formatter (FORMAT below)
//   flag    0 or 1

/** name, section, operand kinds, stack effect / notes */
const TABLE = [
  // ------------------------------------------------------------------ core --
  ['CONST', 'core', ['const'], 'push constants[k]'],
  ['NOTHING', 'core', [], 'push Nothing (Crumb) / None (MiniPy): the same value'],
  ['TRUE', 'core', [], 'push True'],
  ['FALSE', 'core', [], 'push False'],
  ['POP', 'core', [], 'discard the top value'],
  ['DUP', 'core', [], 'push a copy of the top value'],

  ['GET_GLOBAL', 'core', ['slot'], 'push globals[s]; an unbound slot is fault NAME'],
  ['SET_GLOBAL', 'core', ['slot'], 'pop into globals[s]'],
  ['GET_LOCAL', 'core', ['slot'], 'push slots[s] of the current frame; unbound is fault NAME'],
  ['SET_LOCAL', 'core', ['slot'], 'pop into slots[s] of the current frame'],

  ['NOT', 'core', [], 'pop a Boolean, push its negation; any other type is fault BOOL'],
  ['JUMP', 'core', ['target'], 'jump'],
  ['JUMP_IF_FALSE', 'core', ['target'], 'pop a Boolean, jump if False; any other type is fault BOOL'],

  ['CALL', 'core', ['proc', 'count'], 'call a procedure known at compile time with n arguments'],
  ['RETURN', 'core', [], 'pop the result, run pending finally blocks, leave the frame'],
  ['RETURN_NOTHING', 'core', [], 'RETURN with Nothing / None as the result'],

  ['PRINT', 'core', ['count', 'fmt'], 'pop n values, write them space-separated as one line'],
  ['TRANSCRIPT', 'core', ['count', 'fmt'], 'PRINT, but to the transcript sink'],
  ['HALT', 'core', [], 'stop the program'],

  // ----------------------------------------------------------------- crumb --
  ['NEW_ARRAY', 'crumb', [], 'pop a whole Number n, push an Array of 0..n'],
  ['GET_INDEX', 'crumb', [], 'pop index, array; push the element'],
  ['SET_INDEX', 'crumb', [], 'pop value, index, array; store'],

  ['ADD', 'crumb', [], 'Number + Number only'],
  ['SUB', 'crumb', [], 'Number - Number'],
  ['MUL', 'crumb', [], 'Number * Number'],
  ['DIV', 'crumb', [], 'Number / Number'],
  ['IDIV_TRUNC', 'crumb', [], '\\ : integer division truncating toward zero'],
  ['MOD_TRUNC', 'crumb', [], 'Mod: the result takes the sign of the left operand'],
  ['POW', 'crumb', [], 'Number ^ Number'],
  ['NEG', 'crumb', [], 'unary minus on a Number'],
  ['CONCAT', 'crumb', [], '& : both operands converted to String'],

  ['EQ', 'crumb', [], '= : same type on both sides, or Nothing on either'],
  ['NE', 'crumb', [], '<>'],
  ['LT', 'crumb', [], '< : two Numbers or two Strings'],
  ['LE', 'crumb', [], '<='],
  ['GT', 'crumb', [], '>'],
  ['GE', 'crumb', [], '>='],

  ['CHECK_BOOL', 'crumb', [], 'assert the top value is a Boolean, leave it'],
  ['AND_JUMP', 'crumb', ['target'], 'top must be Boolean: False -> jump keeping it, else pop'],
  ['OR_JUMP', 'crumb', ['target'], 'top must be Boolean: True -> jump keeping it, else pop'],

  ['CALL_BUILTIN', 'crumb', ['builtin', 'count'], 'call a Crumb built-in with n arguments'],
  ['NEW_OBJECT', 'crumb', ['class', 'count'], 'New: pop n arguments, push a new object of the class'],
  ['CALL_METHOD', 'crumb', ['const', 'count'], 'pop n arguments and an object; call its method named constants[k]'],
  ['NO_RETURN', 'crumb', [], 'reached the End of a Function: runtime error'],

  // ---------------------------------------------------------------- python --
  ['TRUTHY', 'python', [], 'pop any value, push its truth value as a Boolean'],
  ['JUMP_IF_FALSY_KEEP', 'python', ['target'], '`and`: falsy -> jump keeping it, else pop'],
  ['JUMP_IF_TRUTHY_KEEP', 'python', ['target'], '`or`: truthy -> jump keeping it, else pop'],

  ['PY_ADD', 'python', [], '+ on numbers, str, list, tuple'],
  ['PY_SUB', 'python', [], '-'],
  ['PY_MUL', 'python', [], '* on numbers, and sequence repetition'],
  ['PY_TRUEDIV', 'python', [], '/ : always a float'],
  ['PY_FLOORDIV', 'python', [], '// : floor division'],
  ['PY_MOD', 'python', [], '% : the result takes the sign of the right operand'],
  ['PY_POW', 'python', [], '**'],
  ['PY_NEG', 'python', [], 'unary -'],
  ['PY_POS', 'python', [], 'unary +'],
  ['PY_STR', 'python', [], 'pop a value, push str(value) (f-strings)'],

  ['PY_EQ', 'python', [], '== : any two values; mixed types are unequal'],
  ['PY_NE', 'python', [], '!='],
  ['PY_LT', 'python', [], '<'],
  ['PY_LE', 'python', [], '<='],
  ['PY_GT', 'python', [], '>'],
  ['PY_GE', 'python', [], '>='],
  ['PY_IS', 'python', [], 'is'],
  ['PY_IS_NOT', 'python', [], 'is not'],
  ['PY_IN', 'python', [], 'in'],
  ['PY_NOT_IN', 'python', [], 'not in'],

  ['BUILD_LIST', 'python', ['count'], 'pop n values, push a list'],
  ['BUILD_TUPLE', 'python', ['count'], 'pop n values, push a tuple'],
  ['BUILD_DICT', 'python', ['count'], 'pop n key/value pairs, push a dict'],
  ['LIST_APPEND', 'python', [], 'pop a value, append it to the list two below (comprehensions)'],
  ['UNPACK_SEQUENCE', 'python', ['count'], 'pop a sequence of exactly n items, push them last-first'],

  ['GET_ITEM', 'python', [], 'pop index, object; push object[index]'],
  ['SET_ITEM', 'python', [], 'pop value, index, object; object[index] = value'],
  ['DEL_ITEM', 'python', [], 'pop index, object; del object[index]'],
  ['GET_SLICE', 'python', [], 'pop step, stop, start, object; push the slice'],
  ['GET_ATTR', 'python', ['const'], 'pop object, push object.name'],
  ['SET_ATTR', 'python', ['const'], 'pop value, object; object.name = value'],

  ['CALL_VALUE', 'python', ['count'], 'pop n arguments and a callable; call it'],
  ['MAKE_FUNCTION', 'python', ['proc', 'count'], 'pop n default values, push a function'],
  ['MAKE_CLASS', 'python', ['proc', 'const'], 'pop the base class (or None), run the class body, push the class'],

  ['GET_ITER', 'python', [], 'pop an iterable, push an iterator'],
  ['FOR_ITER', 'python', ['target'], 'push the next item, or pop the iterator and jump when exhausted'],

  ['SETUP_EXCEPT', 'python', ['target'], 'push an except handler at target'],
  ['POP_EXCEPT', 'python', [], 'drop the innermost except handler (the try body finished)'],
  ['SETUP_FINALLY', 'python', ['target'], 'push a finally handler at target'],
  ['POP_FINALLY', 'python', [], 'drop the finally handler and fall into its body normally'],
  ['END_FINALLY', 'python', [], 'end of a finally body: resume a pending raise or return'],
  ['MATCH_EXCEPT', 'python', ['count', 'target'], 'pop n classes; the exception on top matches one, or jump'],
  ['END_EXCEPT', 'python', [], 'a handler body finished: the exception is dealt with'],
  ['RAISE', 'python', ['flag'], '1: pop an exception and raise it; 0: re-raise the current one'],
];

let code = 0;
const entries = TABLE.map(([name, section, operands, note]) => ({
  name, section, operands, note, code: code++,
}));

/** name -> opcode number */
export const Op = Object.freeze(Object.fromEntries(entries.map((e) => [e.name, e.code])));

/** opcode -> { name, section, operands, note, code } */
export const OP_INFO = Object.freeze(entries);

/** opcode -> number of inline operands. */
export const OPERANDS = Object.freeze(Object.fromEntries(entries.map((e) => [e.code, e.operands.length])));

/** opcode -> mnemonic, for the disassembler and error messages. */
export const OP_NAMES = Object.freeze(Object.fromEntries(entries.map((e) => [e.code, e.name])));

/** section -> opcode names */
export const SECTIONS = Object.freeze({
  core: entries.filter((e) => e.section === 'core').map((e) => e.name),
  crumb: entries.filter((e) => e.section === 'crumb').map((e) => e.name),
  python: entries.filter((e) => e.section === 'python').map((e) => e.name),
});

/** The formatter a PRINT uses, chosen per instruction by its `fmt` operand. */
export const FORMAT = Object.freeze({ CRUMB: 0, PYTHON: 1 });

/** Crumb operator token -> opcode, for the Crumb compiler's binary case. */
export const CRUMB_BINARY_OPS = Object.freeze({
  '+': Op.ADD, '-': Op.SUB, '*': Op.MUL, '/': Op.DIV, '\\': Op.IDIV_TRUNC,
  Mod: Op.MOD_TRUNC, '^': Op.POW, '&': Op.CONCAT,
  '=': Op.EQ, '<>': Op.NE, '<': Op.LT, '<=': Op.LE, '>': Op.GT, '>=': Op.GE,
});

/** MiniPy operator -> opcode, for the MiniPy compiler. */
export const PY_BINARY_OPS = Object.freeze({
  '+': Op.PY_ADD, '-': Op.PY_SUB, '*': Op.PY_MUL, '/': Op.PY_TRUEDIV,
  '//': Op.PY_FLOORDIV, '%': Op.PY_MOD, '**': Op.PY_POW,
});
export const PY_COMPARE_OPS = Object.freeze({
  '==': Op.PY_EQ, '!=': Op.PY_NE, '<': Op.PY_LT, '<=': Op.PY_LE, '>': Op.PY_GT, '>=': Op.PY_GE,
  is: Op.PY_IS, 'is not': Op.PY_IS_NOT, in: Op.PY_IN, 'not in': Op.PY_NOT_IN,
});
