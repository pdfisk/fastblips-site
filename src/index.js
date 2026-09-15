// Public entry point: source text in, AST plus load errors out.

import { tokenize } from './vm/lexer.js';
import { parseTokens } from './vm/parser.js';
import { compile as compileAst } from './vm/compiler.js';
import { run as runChunk } from './vm/vm.js';
import { formatDiagnostics, sortErrors, CrumbError } from './vm/diagnostics.js';

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

/**
 * Loads a Crumb program: tokenize, then parse.
 *
 * Per spec section 11 all load errors are collected rather than thrown, and an
 * AST is still returned so tooling can work with a partial parse. Lexical
 * errors are reported alongside syntactic ones, but a file that failed to
 * tokenize cleanly is parsed anyway, on the tokens that were recovered.
 *
 * @param {string} source
 * @param {{filename?: string}} options
 * @returns {{ast: object, tokens: object[], errors: CrumbError[], ok: boolean}}
 */
export function parse(source, { filename = 'input.crumb' } = {}) {
  const { tokens, errors: lexErrors } = tokenize(source, { filename });
  const { ast, errors: parseErrors } = parseTokens(tokens, { filename });
  const errors = sortErrors([...lexErrors, ...parseErrors]);
  return { ast, tokens, errors, ok: errors.length === 0 };
}

/**
 * Same as `parse`, but throws the first load error instead of returning a list.
 * Convenient in tests and one-liners.
 */
export function parseOrThrow(source, options = {}) {
  const result = parse(source, options);
  if (!result.ok) {
    const first = result.errors[0];
    const message = formatDiagnostics(result.errors, source, options.filename ?? 'input.crumb');
    const error = new CrumbError(message, { line: first.line, column: first.column });
    error.errors = result.errors;
    throw error;
  }
  return result.ast;
}

/**
 * Loads and compiles a Crumb program: tokenize, parse, then compile to
 * bytecode. The compile pass is also the resolver, so it contributes the load
 * errors the parser cannot see (undeclared name, duplicate Dim, wrong argument
 * count). All of them are collected, never thrown.
 *
 * @param {string} source
 * @param {{filename?: string}} options
 * @returns {{chunk: object|null, ast: object, tokens: object[], errors: CrumbError[], ok: boolean}}
 */
export function compile(source, { filename = 'input.crumb' } = {}) {
  const { ast, tokens, errors: frontErrors } = parse(source, { filename });
  // A file that failed to parse is not compiled: the AST has holes, and the
  // resolver would report cascades rather than causes.
  if (frontErrors.length > 0) {
    return { chunk: null, ast, tokens, errors: frontErrors, ok: false };
  }
  const { chunk, errors } = compileAst(ast, { filename });
  return { chunk, ast, tokens, errors, ok: errors.length === 0 };
}

/**
 * Loads, compiles and runs a Crumb program.
 *
 * @param {string} source
 * @param {object} options - `filename`, plus any VM option (`out`, `maxSteps`,
 *   `maxDepth`, `random`).
 * @returns {{output: string[], loadErrors: CrumbError[], error: CrumbError|null, ok: boolean, steps: number}}
 */
export function run(source, { filename = 'input.crumb', ...vmOptions } = {}) {
  const { chunk, errors } = compile(source, { filename });
  if (!chunk || errors.length > 0) {
    return { output: [], loadErrors: errors, error: null, ok: false, steps: 0 };
  }
  const result = runChunk(chunk, vmOptions);
  return {
    output: result.output,
    loadErrors: [],
    error: result.error,
    ok: result.error === null,
    steps: result.steps,
  };
}
