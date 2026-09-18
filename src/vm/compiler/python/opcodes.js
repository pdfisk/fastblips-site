// MiniPy bytecode instruction set.

// Instructions are objects { op, a, b, line } in a flat array; jump operands
// (in `a`) are indices into that same array. This trades Crumb's packed
// inline-word encoding for a plain array-of-records, which is far simpler
// to get right and still gives a real compiled/addressable instruction
// stream distinct from walking the AST (see the project README for why).
const OP = {
  CONST: 'CONST',             // a = constant index
  POP: 'POP',
  DUP: 'DUP',

  LOAD_GLOBAL: 'LOAD_GLOBAL', // a = name-constant index
  STORE_GLOBAL: 'STORE_GLOBAL',
  LOAD_LOCAL: 'LOAD_LOCAL',   // a = slot number
  STORE_LOCAL: 'STORE_LOCAL',

  BUILD_LIST: 'BUILD_LIST',   // a = n
  BUILD_TUPLE: 'BUILD_TUPLE', // a = n
  BUILD_DICT: 'BUILD_DICT',   // a = n pairs (pops 2n)
  LIST_APPEND: 'LIST_APPEND', // pops value, appends to the list 1 below top; leaves list on stack
  UNPACK_SEQUENCE: 'UNPACK_SEQUENCE', // a = n; pops an iterable, pushes n items reversed

  BINARY: 'BINARY',           // a = op string
  UNARY: 'UNARY',             // a = op string ('-','+','not','str')
  COMPARE: 'COMPARE',         // a = op string

  GET_ITEM: 'GET_ITEM',
  SET_ITEM: 'SET_ITEM',       // stack: obj, index, value (top) ->
  DEL_ITEM: 'DEL_ITEM',       // stack: obj, index ->
  GET_SLICE: 'GET_SLICE',     // stack: obj, start, stop, step (top) -> value
  GET_ATTR: 'GET_ATTR',       // a = name-constant index
  SET_ATTR: 'SET_ATTR',       // a = name-constant index; stack: obj, value (top) ->

  JUMP: 'JUMP',                       // a = addr
  JUMP_IF_FALSE: 'JUMP_IF_FALSE',     // a = addr; pops
  JUMP_IF_TRUE_NOPOP: 'JUMP_IF_TRUE_NOPOP',   // for `or`; a = addr; peeks
  JUMP_IF_FALSE_NOPOP: 'JUMP_IF_FALSE_NOPOP', // for `and`; a = addr; peeks

  CALL: 'CALL',                 // a = argc
  RETURN: 'RETURN',
  MAKE_FUNCTION: 'MAKE_FUNCTION', // a = procIndex, b = nDefaults (pops nDefaults)
  MAKE_CLASS: 'MAKE_CLASS',       // a = procIndex, b = name-constant index; stack: base(or None) ->

  FOR_ITER_INIT: 'FOR_ITER_INIT',   // pops iterable, pushes iterator state
  FOR_ITER_NEXT: 'FOR_ITER_NEXT',   // a = exhaustedAddr; pushes next value, or pops+jumps

  SETUP_TRY: 'SETUP_TRY',         // a = exceptDispatchAddr
  POP_TRY: 'POP_TRY',
  SETUP_FINALLY: 'SETUP_FINALLY', // a = finallyBodyAddr
  POP_FINALLY: 'POP_FINALLY',
  END_FINALLY: 'END_FINALLY',
  MATCH_EXCEPT: 'MATCH_EXCEPT',   // a = n type values already pushed; patched later to hold [n, noMatchAddr] via a/b
  STORE_EXC: 'STORE_EXC',         // a = slot-or-nameConstIdx, b = isLocal(0/1); -1 = discard
  RAISE: 'RAISE',                 // a = 1 (value already pushed) or 0 (bare re-raise)
  END_EXCEPT: 'END_EXCEPT',

  HALT: 'HALT',
};

export { OP };
