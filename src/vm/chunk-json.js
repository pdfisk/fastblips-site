// A compiled chunk as plain JSON, and back: how compiled code is stored with a
// source record (the Compile button of a DatabaseWindow) and loaded again in
// place of compiling the source (src/vm/program-loader.js).
//
// Only the chunk's own data is kept: language, filename, code, lines,
// constants, globals, procedures and entry. Live runtime objects a front end
// attaches (MiniPy's globalInit and runtime - builtin classes and functions)
// are not data; chunkFromJson rebuilds them. Constants JSON cannot hold are
// tagged: a BigInt as {"$bigint": "123"}, a non-finite number as
// {"$number": "Infinity"}.
//
// Two fingerprints travel with the code:
//   opcodes     a hash of the instruction set it was compiled for. Compiled
//               code from a different instruction set is rejected, since its
//               numbers would mean other opcodes.
//   sourceHash  (when the compiler was given the source) a hash of that
//               source, so a loader can tell whether the code still matches
//               the source it sits next to.

import { OP_INFO } from './opcodes.js';
import { attachPythonRuntime } from './runtime/python-builtins.js';

export const CHUNK_FORMAT = 'crumb-chunk';
export const CHUNK_VERSION = 1;

const OMIT = new Set(['globalInit', 'runtime', 'initialSlot']);
const LANGUAGES = new Set(['crumb', 'python']);

/** An FNV-1a 32-bit hash of a string, as 8 hex digits. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A short fingerprint of source text (its length and two hashes). */
export function sourceHash(source) {
  const text = String(source ?? '');
  return `${text.length.toString(36)}-${fnv1a(text)}-${fnv1a(`${text}\u0000`)}`;
}

/** A fingerprint of the instruction set: every opcode's number, name and operands. */
export const OPCODE_SIGNATURE = fnv1a(OP_INFO.map((e) => `${e.code}:${e.name}:${e.operands.join(',')}`).join(';'));

/** Compiled code that cannot be loaded; message says why. */
export class ChunkFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChunkFormatError';
  }
}

/**
 * Returns a JSON-safe copy of chunk. extra adds fields; pass
 * { sourceHash: sourceHash(source) } to tie the code to its source.
 */
export function chunkToJson(chunk, extra = {}) {
  const out = { format: CHUNK_FORMAT, version: CHUNK_VERSION, opcodes: OPCODE_SIGNATURE, ...extra };
  for (const [key, value] of Object.entries(chunk)) {
    if (OMIT.has(key) || typeof value === 'function') continue;
    out[key] = key === 'constants' ? value.map(encodeConstant) : value;
  }
  return JSON.parse(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? { $bigint: String(v) } : v)));
}

/** chunkToJson as a string. */
export function chunkToJsonString(chunk, extra = {}) {
  return JSON.stringify(chunkToJson(chunk, extra));
}

/**
 * Parses compiled code (a JSON string, or the object chunkToJson made) and
 * checks it is a chunk this VM can run. Returns the JSON object; throws a
 * ChunkFormatError if it is not.
 */
export function parseChunkJson(data) {
  let json = data;
  if (typeof data === 'string') {
    try { json = JSON.parse(data); } catch (e) { throw new ChunkFormatError(`compiled code is not valid JSON: ${e.message}`); }
  }
  if (!json || typeof json !== 'object') throw new ChunkFormatError('compiled code is empty');
  if (json.format !== CHUNK_FORMAT) throw new ChunkFormatError(`compiled code has format ${JSON.stringify(json.format)}, not ${CHUNK_FORMAT}`);
  if (json.version !== CHUNK_VERSION) throw new ChunkFormatError(`compiled code is version ${json.version}; this VM reads version ${CHUNK_VERSION}`);
  if (json.opcodes !== OPCODE_SIGNATURE) throw new ChunkFormatError('compiled code was made for a different instruction set; recompile it');
  if (!LANGUAGES.has(json.language)) throw new ChunkFormatError(`compiled code has unknown language ${JSON.stringify(json.language)}`);
  const isIntArray = (a) => Array.isArray(a) && a.every(Number.isInteger);
  if (!isIntArray(json.code) || !isIntArray(json.lines) || json.lines.length !== json.code.length) {
    throw new ChunkFormatError('compiled code has a malformed code or lines array');
  }
  if (!Array.isArray(json.constants) || !Array.isArray(json.globalNames) || !Array.isArray(json.procedures)
    || !Number.isInteger(json.globalCount) || !Number.isInteger(json.entry)) {
    throw new ChunkFormatError('compiled code is missing constants, globals, procedures or entry');
  }
  return json;
}

/**
 * Turns compiled code back into a chunk the VM can run: a fresh chunk each
 * call, so two programs loaded from the same code share nothing. Throws a
 * ChunkFormatError if the code cannot be loaded.
 */
export function chunkFromJson(data) {
  const json = parseChunkJson(data);
  const chunk = {};
  for (const [key, value] of Object.entries(json)) {
    if (key === 'format' || key === 'version' || key === 'opcodes' || key === 'sourceHash') continue;
    chunk[key] = key === 'constants' ? value.map(decodeConstant) : structuredCopy(value);
  }
  return chunk.language === 'python' ? attachPythonRuntime(chunk) : chunk;
}

function encodeConstant(value) {
  if (typeof value === 'bigint') return { $bigint: String(value) };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  return value;
}

function decodeConstant(value) {
  if (value && typeof value === 'object') {
    if (typeof value.$bigint === 'string') return BigInt(value.$bigint);
    if (typeof value.$number === 'string') return Number(value.$number);
    throw new ChunkFormatError(`compiled code has an unknown constant ${JSON.stringify(value)}`);
  }
  return value;
}

// JSON values only, so a JSON round trip is an exact copy.
function structuredCopy(value) {
  return value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}
