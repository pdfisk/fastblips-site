// Bytecode listing for any chunk, Crumb or MiniPy. The addresses are indices
// into the flat code array, so they match the jump operands exactly.
//
// Operand notes come from each opcode's operand kinds in opcodes.js, so a new
// opcode is listed correctly without touching this file.

import { OP_INFO, FORMAT } from './opcodes.js';
import { toStr, isString } from './runtime/crumb-values.js';
import { pyRepr } from './runtime/python-values.js';
import { BUILTIN_LIST } from './runtime/crumb-builtins.js';

function showConstant(chunk, value) {
  if (chunk.language === 'python') return pyRepr(value);
  return isString(value) ? JSON.stringify(value) : toStr(value);
}

function annotate(chunk, info, operands, proc) {
  const notes = [];
  info.operands.forEach((kind, i) => {
    const v = operands[i];
    switch (kind) {
      case 'const': notes.push(showConstant(chunk, chunk.constants[v])); break;
      case 'target': notes.push(`-> ${v}`); break;
      case 'slot':
        if (info.name.endsWith('_GLOBAL')) notes.push(chunk.globalNames?.[v] ?? '');
        else notes.push(proc ? `${proc.name}:${proc.slotNames?.[v] ?? v}` : '');
        break;
      case 'proc': { const p = chunk.procedures[v]; notes.push(p ? p.name : '?'); break; }
      case 'builtin': notes.push(`builtin ${BUILTIN_LIST[v]?.name ?? v}`); break;
      case 'fmt': notes.push(v === FORMAT.PYTHON ? 'str()' : 'Str'); break;
      default: break;   // count, flag: the number says it all
    }
  });
  if (info.name === 'PRINT') {
    return `${operands[0]} value${operands[0] === 1 ? '' : 's'} as ${operands[1] === FORMAT.PYTHON ? 'str()' : 'Str'}`;
  }
  if (info.name === 'CALL' || info.name === 'CALL_BUILTIN') return `${notes[0]}/${operands[1]}`;
  return notes.filter(Boolean).join(' ');
}

function listing(chunk, from, to, proc, out) {
  let ip = from;
  let lastLine = -1;
  while (ip < to) {
    const info = OP_INFO[chunk.code[ip]];
    const count = info ? info.operands.length : 0;
    const operands = chunk.code.slice(ip + 1, ip + 1 + count);
    const line = chunk.lines[ip];
    const gutter = line === lastLine ? '    |' : String(line).padStart(5);
    lastLine = line;
    const note = info ? annotate(chunk, info, operands, proc) : '';
    const name = info ? info.name : `?${chunk.code[ip]}`;
    out.push(
      `${gutter}  ${String(ip).padStart(5)}  ${name.padEnd(19)}`
      + `${operands.join(' ').padEnd(7)}${note ? ` ; ${note}` : ''}`.trimEnd(),
    );
    ip += 1 + count;
  }
}

/** Renders a chunk: constants, globals, module code, then each procedure. */
export function disassemble(chunk) {
  const out = [];

  out.push(`; ${chunk.filename} (${chunk.language ?? 'crumb'})`);
  out.push(`; ${chunk.code.length} words, ${chunk.constants.length} constants, `
    + `${chunk.globalCount} globals, ${chunk.procedures.length} procedures`);
  out.push('');

  if (chunk.constants.length) {
    out.push('constants');
    chunk.constants.forEach((value, index) => {
      out.push(`  ${String(index).padStart(4)}  ${showConstant(chunk, value)}`);
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
  out.push('line     addr  op                 args    ; note');
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
