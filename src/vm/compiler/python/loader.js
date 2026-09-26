// Loader: the MiniPy pipeline - lex, parse, compile, run.
//
// MiniPy compiles to the same bytecode as Crumb and runs on the same VM
// (src/vm/vm.js), so a compiled chunk can also be handed to a Scheduler.
// Nothing throws on bad input: load errors come back as a list, and a
// runtime fault comes back as `error`.

import { parseSource } from './parser.js';
import { compileAst } from './compiler.js';
import { VM } from '../../vm.js';
import { RuntimeFault } from '../../faults.js';

/** Python's own default recursion limit. */
export const DEFAULT_MAX_DEPTH = 1000;
export const DEFAULT_MAX_STEPS = 5_000_000;

/** Source -> { module, errors }. Stops after the AST. */
export function parse(source) {
  return parseSource(source);
}

/**
 * Source -> { ok, chunk, loadErrors }. Lexical, syntactic and compile-time
 * errors are collected, never thrown.
 */
export function compile(source, { filename = '<program>' } = {}) {
  const { module, errors: parseErrors } = parseSource(source);
  if (parseErrors.length > 0) return { ok: false, chunk: null, loadErrors: parseErrors };
  const { chunk, errors } = compileAst(module, { filename });
  if (errors.length > 0) return { ok: false, chunk: null, loadErrors: errors };
  return { ok: true, chunk, loadErrors: [] };
}

/** `file:line: error: message`, one line per load error. */
export function formatLoadErrors(errors, filename = '<program>') {
  return errors.map((e) => `${filename}:${e.line}: error: ${e.message}`);
}

/**
 * Renders a runtime fault the MiniPy way:
 *
 *   tally.py:9: TypeError: unsupported operand type(s) for +: 'int' and 'str'
 *   tally.py:9:     return x + "a"
 *     in boom(), called at tally.py:4
 */
export function formatFault(fault, source, filename = '<program>') {
  const lines = source.split(/\r\n|\n|\r/);
  const code = (lines[fault.line - 1] ?? '').trim();
  const excType = fault.excType ?? 'Error';
  const out = [`${filename}:${fault.line}: ${excType}${fault.message ? `: ${fault.message}` : ''}`];
  out.push(`${filename}:${fault.line}:     ${code}`);
  for (const frame of fault.traceback) {
    const name = frame.kind === 'class' ? `<class ${frame.name}>` : `${frame.name}()`;
    out.push(`  in ${name}, called at ${filename}:${frame.line}`);
  }
  return out.join('\n');
}

/**
 * Compiles and runs a MiniPy program to completion.
 *
 * @param {string} source
 * @param {object} options - `filename` for diagnostics, `out` (a line sink;
 *   lines are also collected either way), plus any VM option (`maxSteps`,
 *   `maxDepth`, `transcript`, `sleep`).
 * @returns {{ok: boolean, output: string[], loadErrors: string[], error: string|null,
 *            fault: RuntimeFault|null, steps: number}}
 */
export function run(source, options = {}) {
  const prepared = prepare(source, options);
  if (!prepared.vm) return prepared.result;
  try {
    prepared.vm.run();
  } catch (err) {
    return prepared.failed(err);
  }
  return prepared.succeeded();
}

/**
 * Like run(), but waits for sleep() and fetch() without blocking the
 * thread. Resolves to the same result.
 */
export async function runAsync(source, options = {}) {
  const prepared = prepare(source, options);
  if (!prepared.vm) return prepared.result;
  try {
    await prepared.vm.runAsync();
  } catch (err) {
    return prepared.failed(err);
  }
  return prepared.succeeded();
}

/** Compiles source and makes its VM, for run() and runAsync(). */
function prepare(source, options) {
  const {
    filename = '<program>', out, maxSteps = DEFAULT_MAX_STEPS, maxDepth = DEFAULT_MAX_DEPTH, ...vmOptions
  } = options;

  const compiled = compile(source, { filename });
  if (!compiled.ok) {
    return {
      vm: null,
      result: {
        ok: false, output: [], loadErrors: formatLoadErrors(compiled.loadErrors, filename), error: null, fault: null, steps: 0,
      },
    };
  }

  const output = [];
  const vm = new VM(compiled.chunk, {
    ...vmOptions,
    maxSteps,
    maxDepth,
    out: (line) => { output.push(line); if (out) out(line); },
  });
  return {
    vm,
    failed(err) {
      if (!(err instanceof RuntimeFault)) throw err;
      return {
        ok: false, output, loadErrors: [], error: formatFault(err, source, filename), fault: err, steps: vm.steps,
      };
    },
    succeeded: () => ({ ok: true, output, loadErrors: [], error: null, fault: null, steps: vm.steps }),
  };
}
