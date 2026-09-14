#!/usr/bin/env node
// crumb — load a .crumb file and print its tokens, AST, or load errors.
//
//   crumb parse  <file>   indented s-expression AST (default)
//   crumb tokens <file>   one line per token
//   crumb json   <file>   the AST as JSON
//   crumb check  <file>   load errors only; exit 1 if any

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  parse, compile, run, formatAst, formatTokens, formatDiagnostics, disassemble,
} from '../src/index.js';

const COMMANDS = new Set(['run', 'parse', 'tokens', 'json', 'check', 'dis']);

const argv = process.argv.slice(2);
let command = 'run';
if (COMMANDS.has(argv[0])) command = argv.shift();
const file = argv[0];

if (!file) {
  process.stderr.write(
    'usage: crumb <command> <file.crumb>\n'
    + '  run     compile and execute      (default)\n'
    + '  dis     disassemble the bytecode\n'
    + '  parse   indented s-expression AST\n'
    + '  tokens  one line per token\n'
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

function reportLoadErrors(errors) {
  process.stderr.write(`${formatDiagnostics(errors, source, filename)}\n`);
  process.stderr.write(`${errors.length} load error${errors.length === 1 ? '' : 's'}\n`);
}

// --- front end only ----------------------------------------------------------
if (command === 'tokens' || command === 'parse' || command === 'json') {
  const { ast, tokens, errors, ok } = parse(source, { filename });
  if (!ok) reportLoadErrors(errors);
  if (command === 'tokens') process.stdout.write(`${formatTokens(tokens)}\n`);
  else if (command === 'json') process.stdout.write(`${JSON.stringify(ast, null, 2)}\n`);
  else process.stdout.write(`${formatAst(ast)}\n`);
  process.exit(ok ? 0 : 1);
}

// --- through the compiler ----------------------------------------------------
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

// --- run ---------------------------------------------------------------------
const result = run(source, {
  filename,
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
