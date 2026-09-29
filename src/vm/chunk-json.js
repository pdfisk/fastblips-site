// chunkToJson: a compiled chunk as plain JSON, for storing with a source
// record (the Compile button of a DatabaseWindow).
//
// Only the chunk's own data is kept: language, filename, code, lines,
// constants, globals, procedures and entry. Live runtime objects a front end
// attaches (MiniPy's globalInit and runtime - builtin classes and functions)
// are not data and are rebuilt by that front end, so they are left out.
// Constants JSON cannot hold are tagged: a BigInt as {"$bigint": "123"}, a
// non-finite number as {"$number": "Infinity"}.

const OMIT = new Set(['globalInit', 'runtime']);

/** Returns a JSON-safe copy of chunk. */
export function chunkToJson(chunk, extra = {}) {
  const out = { format: 'crumb-chunk', version: 1, ...extra };
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

function encodeConstant(value) {
  if (typeof value === 'bigint') return { $bigint: String(value) };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  return value;
}
