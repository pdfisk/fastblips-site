// loadProgram: a runnable chunk for a program, compiling its source only when
// there is no compiled code to use.
//
// In order:
//   1. compiled code given with the program (a record's compiled_code, from
//      a DatabaseWindow's Compile button), if it loads and still matches the
//      source: it records a hash of the source it was compiled from, so code
//      left over from before the source was edited is not used. A program with
//      no source at all runs from its compiled code alone.
//   2. the compile cache: code this page has already compiled from the same
//      source, so running a program again (Run, Go, Reset + Go) does not
//      compile it again.
//   3. compiling the source; the result goes into the cache.
//
// Every call returns a fresh chunk, so programs loaded from the same code
// never share runtime state (MiniPy's runtime library is rebuilt each time).

import { chunkFromJson, chunkToJson, parseChunkJson, sourceHash, ChunkFormatError } from './chunk-json.js';

/** How many compiled programs the cache keeps (least recently used go first). */
export const CACHE_LIMIT = 64;

const cache = new Map();   // key -> chunk JSON

/** Empties the compile cache. */
export function clearCompileCache() { cache.clear(); }

/** The number of programs in the compile cache. */
export function compileCacheSize() { return cache.size; }

const hasSource = (source) => typeof source === 'string' && source.trim() !== '';

/**
 * @param {object} options
 * @param {'crumb'|'python'} options.language
 * @param {string} [options.source] - the program's source
 * @param {string|object} [options.compiled] - compiled code (chunkToJson's
 *   output, or its JSON string), if the program has any
 * @param {string} [options.filename] - for the compiler's diagnostics
 * @param {(source: string, filename: string) => {chunk: object|null, errors: string, errorCount: number}} options.compile
 *   the language's compiler (a console's compileSource)
 * @returns {{chunk: object|null, origin: 'compiled'|'cache'|'source'|null,
 *            errors: string, errorCount: number, rejected: string|null}}
 *   origin says where the chunk came from; rejected is why compiled code
 *   that was given could not be used, or null.
 */
export function loadProgram({ language, source = '', compiled = null, filename = 'program', compile }) {
  const text = String(source ?? '');
  const hash = sourceHash(text);
  let rejected = null;

  if (compiled !== null && compiled !== undefined && compiled !== '') {
    try {
      const json = parseChunkJson(compiled);
      if (json.language !== language) {
        rejected = `compiled code is ${json.language}, not ${language}`;
      } else if (hasSource(text) && json.sourceHash !== hash) {
        rejected = json.sourceHash ? 'compiled code is out of date: the source has changed since it was compiled'
          : 'compiled code does not record its source, so it may be out of date';
      } else {
        remember(cacheKey(language, filename, hash), json);
        return { chunk: chunkFromJson(json), origin: 'compiled', errors: '', errorCount: 0, rejected: null };
      }
    } catch (e) {
      if (!(e instanceof ChunkFormatError)) throw e;
      rejected = e.message;
    }
    if (!hasSource(text)) {
      return { chunk: null, origin: null, errors: `Cannot run the compiled code: ${rejected}\n`, errorCount: 1, rejected };
    }
  }

  const key = cacheKey(language, filename, hash);
  const cached = cache.get(key);
  if (cached) {
    remember(key, cached);
    return { chunk: chunkFromJson(cached), origin: 'cache', errors: '', errorCount: 0, rejected };
  }

  const result = compile(text, filename);
  if (!result.chunk) {
    return { chunk: null, origin: null, errors: result.errors, errorCount: result.errorCount, rejected };
  }
  remember(key, chunkToJson(result.chunk, { sourceHash: hash }));
  return { chunk: result.chunk, origin: 'source', errors: '', errorCount: 0, rejected };
}

function cacheKey(language, filename, hash) { return `${language}\u0000${filename}\u0000${hash}`; }

function remember(key, json) {
  cache.delete(key);
  cache.set(key, json);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}
