// Bytecode listing. The addresses are indices into the flat code array, so
// they match the jump operands exactly.

import { Op, OPERANDS, OP_NAMES } from './opcodes.js';
import { toStr, isString } from './values.js';

const JUMPS = new Set([Op.JUMP, Op.JUMP_IF_FALSE, Op.AND_JUMP, Op.OR_JUMP]);
const GLOBALS = new Set([Op.GET_GLOBAL, Op.SET_GLOBAL]);
const LOCALS = new Set([Op.GET_LOCAL, Op.SET_LOCAL]);

function annotate(chunk, op, operands, proc) {
  if (op === Op.CONST) {
    const value = chunk.constants[operands[0]];
    return isString(value) ? JSON.stringify(value) : toStr(value);
  }
  if (JUMPS.has(op)) return `-> ${operands[0]}`;
  if (GLOBALS.has(op)) return chunk.globalNames?.[operands[0]] ?? '';
  if (LOCALS.has(op)) return proc ? `${proc.name}:${operands[0]}` : '';
  if (op === Op.CALL) {
    const target = chunk.procedures[operands[0]];
    return `${target ? target.name : '?'}/${operands[1]}`;
  }
  if (op === Op.CALL_BUILTIN) return `builtin ${operands[0]}/${operands[1]}`;
  if (op === Op.PRINT) return `${operands[0]} value${operands[0] === 1 ? '' : 's'}`;
  return '';
}

function listing(chunk, from, to, proc, out) {
  let ip = from;
  let lastLine = -1;
  while (ip < to) {
    const op = chunk.code[ip];
    const count = OPERANDS[op] ?? 0;
    const operands = chunk.code.slice(ip + 1, ip + 1 + count);
    const line = chunk.lines[ip];
    const gutter = line === lastLine ? '    |' : String(line).padStart(5);
    lastLine = line;
    const note = annotate(chunk, op, operands, proc);
    out.push(
      `${gutter}  ${String(ip).padStart(5)}  ${(OP_NAMES[op] ?? `?${op}`).padEnd(15)}`
      + `${operands.join(' ').padEnd(7)}${note ? ` ; ${note}` : ''}`.trimEnd(),
    );
    ip += 1 + count;
  }
}

/** Renders a chunk: constants, globals, module code, then each procedure. */
export function disassemble(chunk) {
  const out = [];

  out.push(`; ${chunk.filename}`);
  out.push(`; ${chunk.code.length} words, ${chunk.constants.length} constants, `
    + `${chunk.globalCount} globals, ${chunk.procedures.length} procedures`);
  out.push('');

  if (chunk.constants.length) {
    out.push('constants');
    chunk.constants.forEach((value, index) => {
      out.push(`  ${String(index).padStart(4)}  ${isString(value) ? JSON.stringify(value) : toStr(value)}`);
    });
    out.push('');
  }

  if (chunk.globalCount) {
    out.push('globals');
    (chunk.globalNames ?? []).forEach((name, index) => {
      out.push(`  ${String(index).padStart(4)}  ${name}`);
    });
    out.push('');
  }

  // Module code runs from `entry` up to the first procedure entry.
  const firstProc = chunk.procedures.reduce(
    (min, proc) => (proc.entry >= 0 ? Math.min(min, proc.entry) : min),
    chunk.code.length,
  );

  out.push(`module            ; ${chunk.entry}..${firstProc - 1}`);
  out.push('line     addr  op             args    ; note');
  listing(chunk, chunk.entry, firstProc, null, out);

  const sorted = [...chunk.procedures].filter((p) => p.entry >= 0).sort((a, b) => a.entry - b.entry);
  sorted.forEach((proc, index) => {
    const end = index + 1 < sorted.length ? sorted[index + 1].entry : chunk.code.length;
    out.push('');
    out.push(`${proc.kind} ${proc.name}  ; arity ${proc.arity}, ${proc.slotCount} slots, ${proc.entry}..${end - 1}`);
    listing(chunk, proc.entry, end, proc, out);
  });

  return out.join('\n');
}
