// Loader: the MiniPy pipeline - lex, parse, compile, run.
//
// The shape mirrors the Basic front end's loader (src/vm/compiler/basic/
// loader.js): nothing throws on bad input, load errors come back as a list,
// and a runtime fault comes back as `error`.

import { parseSource } from './parser.js';
import { compileAst } from './compiler.js';
import { VM } from './vm.js';

/** Source -> { module, errors }. Stops after the AST. */
export function parse(source) {
  return parseSource(source);
}

/**
 * Source -> { ok, chunk } or { ok: false, loadErrors }. Lexical, syntactic
 * and compile-time errors are collected, never thrown.
 */
export function compile(source) {
  const { module, errors: parseErrors } = parseSource(source);
  if (parseErrors.length > 0) return { ok: false, loadErrors: parseErrors };
  const chunk = compileAst(module);
  if (chunk.errors.length > 0) return { ok: false, loadErrors: chunk.errors };
  return { ok: true, chunk };
}

/**
 * Compiles and runs a MiniPy program.
 *
 * @param {string} source
 * @param {object} options - `filename` for diagnostics, `out` (a line sink;
 *   lines are also collected either way), plus any VM option (`maxSteps`,
 *   `maxDepth`).
 * @returns {{ok: boolean, output: string[], loadErrors: string[], error: string|null}}
 */
export function run(source, options = {}) {
  const { filename = '<program>', out, ...vmOptions } = options;
  const lines = source.split('\n');

  const result = compile(source);
  if (!result.ok) {
    return {
      ok: false,
      output: [],
      loadErrors: result.loadErrors.map((e) => `${filename}:${e.line}: error: ${e.message}`),
      error: null,
    };
  }

  const output = [];
  const vm = new VM(result.chunk, {
    ...vmOptions,
    out: (line) => { output.push(line); if (out) out(line); },
  });
  const outcome = vm.run();
  if (!outcome.ok) {
    return { ok: false, output, loadErrors: [], error: outcome.fault.format(filename, lines) };
  }
  return { ok: true, output, loadErrors: [], error: null };
}
