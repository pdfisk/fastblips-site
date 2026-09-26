// Fetch (Crumb), fetch() (MiniPy) and Crumb's JSON helpers, with a fake
// fetch in place of the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { pathSteps } from '../src/vm/runtime/fetch.js';

const WEATHER = JSON.stringify({
  latitude: 43.65,
  current_weather: { temperature: 14.2, windspeed: 9, is_day: 1 },
  hourly: { time: ['2026-09-26T00:00', '2026-09-26T01:00'], temperature_2m: [12.5, 12.1] },
  big: 12345678901234567890,
  none: null,
  ok: true,
});

/** A fake fetch: url -> body (200), or [status, body], or an Error to throw. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    if (route instanceof Error) throw route;
    const [status, body] = Array.isArray(route) ? route : [200, route];
    return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Server Error', text: async () => body };
  };
  fn.calls = calls;
  return fn;
}

const W = 'https://api.example.com/weather';

function crumb(source) {
  const { chunk, errors } = compile(source, { filename: 't.crumb' });
  assert.deepEqual(errors, []);
  return chunk;
}

function py(source) {
  const { chunk, loadErrors } = compilePython(source, { filename: 't.py' });
  assert.ok(chunk, JSON.stringify(loadErrors));
  return chunk;
}

async function runVm(chunk, fetch) {
  const out = [];
  const vm = new VM(chunk, { out: (t) => out.push(t), fetch });
  let error = null;
  try { await vm.runAsync(); } catch (err) { error = err; }
  return { out, vm, error };
}

test('Crumb: Fetch returns the body; JsonGet, JsonCount and JsonKey read it', async () => {
  const { out, error } = await runVm(crumb([
    `Dim data = Fetch("${W}")`,
    'Print JsonGet(data, "current_weather.temperature")',
    'Print JsonGet(data, "hourly.time[1]"), JsonGet(data, "hourly.temperature_2m.0")',
    'Print JsonCount(data, "hourly.time"), JsonCount(data, ""), JsonCount(data, "latitude")',
    'Print JsonKey(data, "current_weather", 1)',
    'Print JsonGet(data, "ok"), JsonGet(data, "none") = Nothing, JsonGet(data, "nope.x") = Nothing',
    'Print JsonGet(JsonGet(data, "current_weather"), "windspeed") + 1',
  ].join('\n')), fakeFetch({ [W]: WEATHER }));
  assert.equal(error, null);
  assert.deepEqual(out, ['14.2', '2026-09-26T01:00 12.5', '2 6 0', 'windspeed', 'True True True', '10']);
});

test('Crumb: a failed Fetch is a runtime error at the call', async () => {
  const { error } = await runVm(crumb('Print Fetch("https://api.example.com/missing")'), fakeFetch({}));
  assert.match(error.message, /Fetch: https:\/\/api.example.com\/missing answered 404 Not Found/);
  assert.equal(error.line, 1);
  const net = await runVm(crumb(`Print Fetch("${W}")`), fakeFetch({ [W]: new TypeError('Failed to fetch') }));
  assert.match(net.error.message, /could not reach/);
});

test('Crumb: Fetch checks its argument', async () => {
  const bad = await runVm(crumb('Print Fetch("ftp://x.org/a")'), fakeFetch({}));
  assert.match(bad.error.message, /only fetch http: and https:/);
  const notUrl = await runVm(crumb('Print Fetch("hello")'), fakeFetch({}));
  assert.match(notUrl.error.message, /expects a web address/);
  const num = await runVm(crumb('Print Fetch(3)'), fakeFetch({}));
  assert.match(num.error.message, /expects a String as argument 1, got Number/);
});

test('Crumb: JsonGet rejects text that is not JSON', async () => {
  const { error } = await runVm(crumb('Print JsonGet("not json", "a")'), fakeFetch({}));
  assert.match(error.message, /JsonGet expects JSON text/);
});

test('MiniPy: fetch() returns dicts, lists, ints, floats, bools and None', async () => {
  const { out, error } = await runVm(py([
    `data = fetch("${W}")`,
    'print(data["current_weather"]["temperature"], data["current_weather"]["windspeed"] + 1)',
    'print(len(data["hourly"]["time"]), data["hourly"]["temperature_2m"][1])',
    'print(data["none"], data["ok"], data["big"])',
    'for k in data["current_weather"]:',
    '    print(k)',
  ].join('\n')), fakeFetch({ [W]: WEATHER }));
  assert.equal(error, null);
  assert.deepEqual(out.slice(0, 2), ['14.2 10', '2 12.1']);
  assert.match(out[2], /^None True 1234567890123456/);   // exact where the host's JSON.parse gives the source
  assert.deepEqual(out.slice(3), ['temperature', 'windspeed', 'is_day']);
});

test('MiniPy: fetch() of text that is not JSON returns a str', async () => {
  const { out } = await runVm(py(`print(fetch("${W}").upper())`), fakeFetch({ [W]: 'plain text' }));
  assert.deepEqual(out, ['PLAIN TEXT']);
});

test('MiniPy: a failed fetch() raises OSError, which try can catch', async () => {
  const { out, error } = await runVm(py([
    'try:',
    '    fetch("https://api.example.com/missing")',
    'except OSError as e:',
    '    print("caught", e)',
    'print("after")',
  ].join('\n')), fakeFetch({}));
  assert.equal(error, null);
  assert.deepEqual(out, ['caught fetch(): https://api.example.com/missing answered 404 Not Found', 'after']);
});

test('MiniPy: fetch() checks its argument', async () => {
  const { out } = await runVm(py([
    'try:',
    '    fetch(42)',
    'except TypeError as e:',
    '    print(e)',
  ].join('\n')), fakeFetch({}));
  assert.deepEqual(out, ["fetch() expects a URL (a str), not 'int'"]);
});

test('VM.run() cannot wait for a fetch', () => {
  const vm = new VM(crumb(`Print Fetch("${W}")`), { out: () => {}, fetch: fakeFetch({ [W]: '1' }) });
  assert.throws(() => vm.run(), /Fetch needs a program run by the scheduler/);
});

test('Scheduler: a fetching process waits off the queues while others run', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetch = async () => { await gate; return { ok: true, status: 200, text: async () => '{"n": 7}' }; };
  const scheduler = new Scheduler({ quantum: 1000 });
  const outA = [];
  const outB = [];
  const a = scheduler.spawn(py('print(fetch("https://api.example.com/n")["n"])'), { out: (t) => outA.push(t), fetch });
  const b = scheduler.spawn(crumb('Print "b ran"'), { out: (t) => outB.push(t) });
  scheduler.runAll();
  assert.equal(a.state, 'waiting');
  assert.equal(b.state, 'done');
  assert.deepEqual(outB, ['b ran']);
  assert.deepEqual(outA, []);
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));   // the response arrives: notify() restarts the loop
  await (scheduler.running ?? scheduler.start());
  assert.equal(a.state, 'done');
  assert.deepEqual(outA, ['7']);
});

test('Scheduler: runToCompletion waits for fetches', async () => {
  const fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, status: 200, text: async () => '[1, 2, 3]' };
  };
  const scheduler = new Scheduler({ quantum: 1000 });
  const out = [];
  scheduler.spawn(py('print(sum(fetch("https://api.example.com/a")))'), { out: (t) => out.push(t), fetch });
  scheduler.spawn(crumb('Print JsonCount(Fetch("https://api.example.com/b"), "")'), { out: (t) => out.push(t), fetch });
  await scheduler.runToCompletion();
  assert.deepEqual(out.sort(), ['3', '6']);
});

test('Scheduler: a process killed while fetching stays killed', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetch = async () => { await gate; return { ok: true, status: 200, text: async () => '1' }; };
  const scheduler = new Scheduler({ quantum: 1000 });
  const out = [];
  const p = scheduler.spawn(crumb('Print Fetch("https://api.example.com/")'), { out: (t) => out.push(t), fetch });
  scheduler.runAll();
  scheduler.kill(p.pid);
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  scheduler.runAll();
  assert.equal(p.state, 'killed');
  assert.deepEqual(out, []);
});

test('JSON paths: dots, brackets and indexes', () => {
  assert.deepEqual(pathSteps('a.b.c'), ['a', 'b', 'c']);
  assert.deepEqual(pathSteps('features[0].properties.place'), ['features', '0', 'properties', 'place']);
  assert.deepEqual(pathSteps('a[1][2]'), ['a', '1', '2']);
  assert.deepEqual(pathSteps('[3]'), ['3']);
});
