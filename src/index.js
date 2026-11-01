// Public entry point: the BlipPy (Python) pipeline and the VM it runs on.
// The load/compile/run pipeline lives in vm/compiler/python/loader.js. (The
// Basic front end was archived: see archive/crumb-basic-2026-10-27.)

export {
  parse, compile, run, runAsync, formatLoadErrors, formatFault, DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS,
} from './vm/compiler/python/loader.js';
export { VM, run as runChunk, RuntimeFault } from './vm/vm.js';
export { disassemble } from './vm/disasm.js';
export { Op, OP_NAMES, OP_INFO, SECTIONS } from './vm/opcodes.js';
