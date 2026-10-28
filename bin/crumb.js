#!/usr/bin/env node
// crumb — load a MiniPy .py file and run, disassemble or inspect it.
//
//   crumb run    <file>   compile and execute (default)
//   crumb dis    <file>   disassemble the bytecode
//   crumb check  <file>   load errors only; exit 1 if any
//   crumb json   <file>   the AST as JSON
//
// (The Basic front end was archived: see archive/crumb-basic-2026-10-27.)

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { disassemble } from '../src/index.js';
import * as python from '../src/vm/compiler/python/loader.js';

const COMMANDS = new Set(['run', 'json', 'check', 'dis']);

const argv = process.argv.slice(2);
let command = 'run';
if (COMMANDS.has(argv[0])) command = argv.shift();
const file = argv[0];

if (!file) {
  process.stderr.write(
    'usage: crumb <command> <file.py>\n'
    + '  run     compile and execute      (default)\n'
    + '  dis     disassemble the bytecode\n'
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
if (extname(file) !== '.py') {
  process.stderr.write(`crumb: ${file} is not a .py file (Basic was archived)\n`);
  process.exit(2);
}
{
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
