// Fetch for programs: the part of Fetch (Crumb) and fetch() (MiniPy) that
// both languages share. The builtins check their arguments in their own
// language's style, then call startFetch.
//
// A fetch is asynchronous, but a program sees it as an ordinary call that
// returns the response. startFetch hands the request to the VM (vm.block),
// which ends the time slice and waits: under a Scheduler the process shows
// as 'waiting' and other programs keep running. When the response arrives
// the call's result is pushed and the program carries on; if the request
// fails, the program gets a runtime error (Crumb) or an OSError (MiniPy) at
// the call.
//
// The request is made with the VM's `fetch` option (default: the global
// fetch of the browser or Node 18+), so tests can inject a fake.

/** How long a request may take before it is abandoned, in milliseconds. */
export const FETCH_TIMEOUT_MS = 30000;

/**
 * Checks url and returns it as a URL string, or calls fail(message).
 * Only http: and https: URLs can be fetched.
 */
export function checkUrl(fnName, url, fail) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return fail(`${fnName} expects a web address such as "https://api.example.com/data", got "${url}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fail(`${fnName} can only fetch http: and https: addresses, got "${url}"`);
  }
  return parsed.href;
}

/**
 * Fetches url and resolves to the response body as text. Rejects with an
 * Error whose message is ready to show the programmer.
 */
export async function fetchText(fetchImpl, fnName, url) {
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${fnName}: this host cannot make web requests`);
  }
  let response;
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined;
    response = await fetchImpl(url, { headers: { Accept: 'application/json, text/plain, */*' }, signal });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`${fnName}: ${url} did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds`);
    }
    throw new Error(`${fnName}: could not reach ${url} (the network is down, the address is wrong, or the site does not allow requests from web pages)`);
  }
  if (!response.ok) {
    const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    throw new Error(`${fnName}: ${url} answered ${status}`);
  }
  return response.text();
}

/**
 * Starts fetching url for the program on vm. convert(text) turns the body
 * into the value the call returns; onError(vm, message) throws the
 * language's error. The builtin must return right after calling this; its
 * return value is ignored.
 */
export function startFetch(vm, fnName, url, { convert, onError }) {
  const promise = fetchText(vm.fetch, fnName, url).then(convert);
  vm.block(promise, onError);
}

// ---- JSON paths, for Crumb's JsonGet and JsonCount -------------------------
//
// A path picks a value out of a JSON document: names and indexes separated
// by dots, e.g. "current_weather.temperature" or "features.0.properties.place".
// An index may also be written in brackets: "features[0].properties.place".
// Array indexes count from 0, as in the JSON. "" is the whole document.

/** Splits a path into its steps (strings). */
export function pathSteps(path) {
  const steps = [];
  for (const part of path.split('.')) {
    const m = /^([^[\]]*)((?:\[[^\]]*\])*)$/.exec(part);
    if (!m) { steps.push(part); continue; }
    if (m[1] !== '') steps.push(m[1]);
    for (const [, index] of m[2].matchAll(/\[([^\]]*)\]/g)) steps.push(index);
  }
  return steps.filter((s, i, all) => s !== '' || all.length > 1);
}

/**
 * Parses json and follows path. Returns { found: true, value } or
 * { found: false, where } (where: the part of the path that was missing).
 * Calls fail(message) if json is not valid JSON.
 */
export function followPath(fnName, json, path, fail) {
  let value;
  try {
    value = JSON.parse(json);
  } catch (err) {
    return fail(`${fnName} expects JSON text as argument 1: ${err.message}`);
  }
  const steps = path.trim() === '' ? [] : pathSteps(path.trim());
  const done = [];
  for (const step of steps) {
    done.push(step);
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(step) || Number(step) >= value.length) return { found: false, where: done.join('.') };
      value = value[Number(step)];
    } else if (value !== null && typeof value === 'object' && Object.hasOwn(value, step)) {
      value = value[step];
    } else {
      return { found: false, where: done.join('.') };
    }
  }
  return { found: true, value };
}
