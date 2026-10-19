#!/usr/bin/env node
// crumb — load a .bas (or MiniPy .py) file and run, disassemble or inspect it.
//
//   crumb run    <file>   compile and execute (default)
//   crumb dis    <file>   disassemble the bytecode
//   crumb check  <file>   load errors only; exit 1 if any
//   crumb parse  <file>   indented s-expression AST        (Crumb only)
//   crumb tokens <file>   one line per token               (Crumb only)
//   crumb json   <file>   the AST as JSON
//
// A .py file goes through the MiniPy front end. Both languages compile to the
// same bytecode and run on the same VM.

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import {
  parse, compile, run, formatAst, formatTokens, formatDiagnostics, disassemble,
} from '../src/index.js';
import * as python from '../src/vm/compiler/python/loader.js';
import { runAsync } from '../src/vm/vm.js';

const COMMANDS = new Set(['run', 'parse', 'tokens', 'json', 'check', 'dis']);

const argv = process.argv.slice(2);
let command = 'run';
if (COMMANDS.has(argv[0])) command = argv.shift();
const file = argv[0];

if (!file) {
  process.stderr.write(
    'usage: crumb <command> <file.bas | file.py>\n'
    + '  run     compile and execute      (default)\n'
    + '  dis     disassemble the bytecode\n'
    + '  parse   indented s-expression AST (Crumb)\n'
    + '  tokens  one line per token        (Crumb)\n'
    + '  json    the AST as JSON\n'
    + '  check   load errors only\n',
  );
  process.exit(2);
}

let source;
try {
  source = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`crumb: cannot read ${file}: ${err.message}\n`);
  process.exit(2);
}

const filename = basename(file);

// --- MiniPy ------------------------------------------------------------------
if (extname(file) === '.py') {
  if (command === 'parse' || command === 'tokens') {
    process.stderr.write(`crumb: '${command}' is not available for MiniPy; try 'json'\n`);
    process.exit(2);
  }
  if (command === 'json') {
    const { module, errors } = python.parse(source);
    if (errors.length) process.stderr.write(`${python.formatLoadErrors(errors, filename).join('\n')}\n`);
    process.stdout.write(`${JSON.stringify(module, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`);
    process.exit(errors.length ? 1 : 0);
  }
  const { chunk, loadErrors } = python.compile(source, { filename });
  if (!chunk) {
    process.stderr.write(`${python.formatLoadErrors(loadErrors, filename).join('\n')}\n`);
    process.stderr.write(`${loadErrors.length} load error${loadErrors.length === 1 ? '' : 's'}\n`);
    process.exit(1);
  }
  if (command === 'check') { process.stdout.write(`${filename}: ok\n`); process.exit(0); }
  if (command === 'dis') { process.stdout.write(`${disassemble(chunk)}\n`); process.exit(0); }
  const result = await python.runAsync(source, { filename, out: (text) => process.stdout.write(`${text}\n`) });
  if (result.error) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  process.exit(0);
}

// --- Crumb: front end only ---------------------------------------------------
function reportLoadErrors(errors) {
  process.stderr.write(`${formatDiagnostics(errors, source, filename)}\n`);
  process.stderr.write(`${errors.length} load error${errors.length === 1 ? '' : 's'}\n`);
}

if (command === 'tokens' || command === 'parse' || command === 'json') {
  const { ast, tokens, errors, ok } = parse(source, { filename });
  if (!ok) reportLoadErrors(errors);
  if (command === 'tokens') process.stdout.write(`${formatTokens(tokens)}\n`);
  else if (command === 'json') process.stdout.write(`${JSON.stringify(ast, null, 2)}\n`);
  else process.stdout.write(`${formatAst(ast)}\n`);
  process.exit(ok ? 0 : 1);
}

// --- Crumb: through the compiler ---------------------------------------------
const { chunk, errors, ok } = compile(source, { filename });
if (!ok) {
  reportLoadErrors(errors);
  process.exit(1);
}

if (command === 'check') {
  process.stdout.write(`${filename}: ok\n`);
  process.exit(0);
}

if (command === 'dis') {
  process.stdout.write(`${disassemble(chunk)}\n`);
  process.exit(0);
}

// runAsync, so Sleep and Fetch wait without blocking.
const result = await runAsync(chunk, {
  out: (text) => process.stdout.write(`${text}\n`),
});

if (result.error) {
  const { error } = result;
  process.stderr.write(`${formatDiagnostics([error], source, filename)}\n`);
  for (const frame of error.traceback) {
    process.stderr.write(`  in ${frame.kind} ${frame.name}, called at ${filename}:${frame.line}\n`);
  }
  process.exit(1);
}
process.exit(0);
