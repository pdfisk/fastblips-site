// examples/json-explorer.crumb: Fetch a JSON API, list its keys sorted,
// show the picked key's value; a two-pane desktop layout and a one-pane
// mobile layout. The network is replaced by a fake fetch whose answers
// have the shape of the five real APIs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from '../src/index.js';
import { VM } from '../src/vm/vm.js';
import { FakeHost } from './fake-widget-host.js';

const SOURCE = readFileSync(new URL('../examples/json-explorer.crumb', import.meta.url), 'utf8');

const ANSWERS = {
  'https://pokeapi.co/api/v2/pokemon/pikachu': {
    name: 'pikachu', id: 25, height: 4, weight: 60, is_default: true, base_experience: 112,
    abilities: [{ ability: { name: 'static' }, is_hidden: false, slot: 1 }],
    types: [{ slot: 1, type: { name: 'electric' } }],
    moves: Array.from({ length: 120 }, (_, i) => ({ move: { name: `move-${i}` } })),
    sprites: { front_default: 'https://x/25.png', back_female: null, other: { 'official-artwork': { front_default: 'https://x/a.png' } } },
    stats: [{ base_stat: 35, stat: { name: 'hp' } }], species: { name: 'pikachu' }, past_types: [], forms: [{ name: 'pikachu' }],
  },
  'https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true': {
    latitude: 43.65, longitude: -79.38, generationtime_ms: 0.03, utc_offset_seconds: 0, timezone: 'GMT', elevation: 90,
    current_weather_units: { time: 'iso8601', temperature: '°C', windspeed: 'km/h' },
    current_weather: { time: '2026-10-01T15:00', temperature: 14.2, windspeed: 9.4, winddirection: 250, is_day: 1, weathercode: 3 },
  },
  'https://api.wheretheiss.at/v1/satellites/25544': {
    name: 'iss', id: 25544, latitude: -12.5, longitude: 101.3, altitude: 420.1, velocity: 27600.2,
    visibility: 'daylight', footprint: 4500, timestamp: 1790870000, daynum: 2461000.1, solar_lat: -3.1, solar_lon: 50.2, units: 'kilometers',
  },
  'https://en.wikipedia.org/api/rest_v1/page/summary/Toronto': {
    type: 'standard', title: 'Toronto', displaytitle: '<span>Toronto</span>', namespace: { id: 0, text: '' },
    titles: { canonical: 'Toronto', normalized: 'Toronto', display: 'Toronto' }, pageid: 64646,
    coordinates: { lat: 43.74, lon: -79.37 }, description: 'Capital city of Ontario, Canada',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Toronto' }, mobile: { page: 'https://en.m.wikipedia.org/wiki/Toronto' } },
    extract: 'Toronto is the most populous city in Canada. '.repeat(10),
  },
  'https://api.github.com/repos/python/cpython': {
    id: 81598961, name: 'cpython', full_name: 'python/cpython', private: false, homepage: 'https://www.python.org',
    owner: { login: 'python', id: 1525981, type: 'Organization' }, description: 'The Python programming language',
    language: 'Python', stargazers_count: 70000, forks_count: 30000, mirror_url: null, archived: false,
    topics: [], license: { key: 'other', name: 'Other', spdx_id: 'NOASSERTION', url: null }, default_branch: 'main',
  },
};

async function fakeFetch(url) {
  const answer = ANSWERS[url];
  if (!answer) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
  return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(answer) };
}

/** Starts the example on a screen `width` pixels wide and waits for the first download. */
async function start(width) {
  const { chunk, errors } = compile(SOURCE, { filename: 'json-explorer.crumb' });
  assert.deepEqual(errors.map((e) => e.message), []);
  const host = new FakeHost();
  host.widgets.get(host.viewportId()).props.width = width;
  const vm = new VM(chunk, { gui: host, fetch: fakeFetch, out: () => {} });
  const settle = async () => {
    for (;;) {
      if (vm.runSlice(10000)) return;
      if (vm.blocked) { await vm.blockedOn; continue; }
      if (vm.waiting) return;
    }
  };
  await settle();
  const all = () => [...host.widgets.values()];
  const one = (className) => all().find((w) => w.className === className);
  const labels = () => all().filter((w) => w.className === 'Label').map((w) => w.props.text);
  const pick = async (key) => {
    const list = one('ListPanel');
    host.call(list.id, 'select', [list.items.indexOf(key)]);
    await settle();
    return one('TextPanel').props.text;
  };
  const choose = async (sourceName) => {
    one('Menu').itemHandlers[0](sourceName);
    await settle();
  };
  const parentOf = (w) => host.call(w.id, 'getParent', []);
  return { vm, host, settle, one, labels, pick, choose, parentOf };
}

const sortedKeys = (url) => Object.keys(ANSWERS[url]).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

test('json-explorer: downloads the first source and lists its keys alphabetically', async () => {
  const app = await start(1000);
  assert.equal(app.vm.waiting, true);
  assert.deepEqual(app.one('ListPanel').items, sortedKeys('https://pokeapi.co/api/v2/pokemon/pikachu'));
  assert.deepEqual(app.labels(), ['Pikachu', '14 keys from Pikachu']);
});

test('json-explorer: the detail shows a value, an object, a list and null', async () => {
  const app = await start(1000);
  assert.equal(await app.pick('weight'), 'weight\n\n60\n\nIn Crumb:  JsonGet(data, "weight")');
  assert.equal(await app.pick('types'),
    'types\n\nA list of 1 item:\n\n  0:  {2 fields}\n\nIn Crumb:  JsonGet(data, "types")\nInside it:  JsonGet(data, "types.0")');
  const sprites = await app.pick('sprites');
  assert.match(sprites, /^sprites\n\nAn object with 3 fields:\n\n  back_female:  \(null\)\n  front_default:  https:\/\/x\/25\.png\n  other:  \{1 field\}\n/);
  assert.equal(await app.pick('past_types'), 'past_types\n\n[]\n\nIn Crumb:  JsonGet(data, "past_types")');
  const moves = await app.pick('moves');
  assert.match(moves, /A list of 120 items:/);
  assert.match(moves, / {2}99: {2}\{1 field\}\n {2}\.\.\. and 20 more\n/);
});

test('json-explorer: every key of every source can be shown', async () => {
  const app = await start(1000);
  const names = ['Pikachu', 'Toronto weather', 'Space station', 'Toronto on Wikipedia', 'Python on GitHub'];
  const urls = Object.keys(ANSWERS);
  for (let i = 0; i < names.length; i++) {
    await app.choose(names[i]);
    assert.equal(app.labels()[0], names[i]);
    assert.deepEqual(app.one('ListPanel').items, sortedKeys(urls[i]));
    for (const key of sortedKeys(urls[i])) assert.match(await app.pick(key), new RegExp(`^${key}\\n`));
  }
  assert.match(await app.pick('description'), /^description\n\nThe Python programming language\n/);
});

test('json-explorer: desktop shows the list and the detail side by side', async () => {
  const app = await start(1000);
  const split = app.one('HSplitPanel');
  assert.ok(split);
  assert.equal(app.parentOf(app.one('ListPanel')), app.parentOf(app.one('TextPanel')));
  await app.pick('name');
  assert.equal(app.parentOf(app.one('ListPanel')), split.id);
  assert.notEqual(app.one('Button').props.visible, true);
});

test('json-explorer: mobile swaps the list for the detail, and Back swaps them again', async () => {
  const app = await start(360);
  assert.equal(app.one('HSplitPanel'), undefined);
  const list = app.one('ListPanel');
  const detail = app.one('TextPanel');
  const back = app.one('Button');
  const body = app.parentOf(list);
  assert.ok(body);
  assert.equal(app.parentOf(detail), 0);           // not on the screen yet
  assert.match(await app.pick('name'), /^name\n\npikachu\n/);
  assert.equal(app.parentOf(list), 0);
  assert.equal(app.parentOf(detail), body);
  assert.equal(back.props.visible, true);
  app.host.click(back.id);
  await app.settle();
  assert.equal(app.parentOf(list), body);
  assert.equal(app.parentOf(detail), 0);
  assert.equal(back.props.visible, false);
  // Choosing a source from the detail page goes back to the list.
  await app.pick('name');
  await app.choose('Space station');
  assert.equal(app.parentOf(list), body);
  assert.equal(app.one('ListPanel').items[0], 'altitude');
});
