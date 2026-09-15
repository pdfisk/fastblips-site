// Public entry point: source text in, AST plus load errors out.
// The load/compile/run pipeline lives in vm/loader.js; the functions below
// are convenience wrappers around a shared default Loader.

import { Loader } from './vm/loader.js';

export { Loader } from './vm/loader.js';
export { tokenize, Lexer } from './vm/lexer.js';
export { parseTokens, Parser } from './vm/parser.js';
export { formatAst, formatTokens } from './vm/format.js';
export { Compiler, compile as compileAst } from './vm/compiler.js';
export { VM, run as runChunk, CrumbRuntimeError } from './vm/vm.js';
export { disassemble } from './vm/disasm.js';
export { Op, OP_NAMES } from './vm/opcodes.js';
export { NOTHING, CrumbArray, toStr, typeName } from './vm/values.js';
export { formatDiagnostics, CrumbError } from './vm/diagnostics.js';
export { TokenType, KEYWORDS, BUILTINS } from './vm/tokens.js';

const loader = new Loader();

export const parse = (source, options) => loader.parse(source, options);
export const parseOrThrow = (source, options) => loader.parseOrThrow(source, options);
export const compile = (source, options) => loader.compile(source, options);
export const run = (source, options) => loader.run(source, options);
