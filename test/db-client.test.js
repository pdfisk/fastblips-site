import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, StoreError, TABLES } from '../src/ui/db-client.js';

// A fake fetch that records requests and answers from a list of responses.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  fn.calls = calls;
  return fn;
}

const store = (fetch) => new SourceStore({ ...TABLES.basic, baseUrl: 'http://db.test/', fetch });

test('list, get, create, update and remove hit the Rails routes', async () => {
  const fetch = fakeFetch(
    { status: 200, body: [{ id: 1, name: 'a.bas' }] },
    { status: 200, body: { id: 1, name: 'a.bas', content: 'x' } },
    { status: 201, body: { id: 2, name: 'b.bas', content: '' } },
    { status: 200, body: { id: 2, name: 'c.bas', content: '' } },
    { status: 204 },
  );
  const s = store(fetch);
  assert.deepEqual(await s.list(), [{ id: 1, name: 'a.bas' }]);
  assert.equal((await s.get(1)).content, 'x');
  assert.equal((await s.create({ name: 'b.bas', content: '' })).id, 2);
  assert.equal((await s.update(2, { name: 'c.bas' })).name, 'c.bas');
  assert.equal(await s.remove(2), undefined);
  assert.deepEqual(fetch.calls.map((c) => `${c.method} ${c.url}`), [
    'GET http://db.test/apps?language=basic',
    'GET http://db.test/apps/1',
    'POST http://db.test/apps',
    'PATCH http://db.test/apps/2',
    'DELETE http://db.test/apps/2',
  ]);
  assert.deepEqual(fetch.calls[2].body, { app: { name: 'b.bas', content: '', language: 'basic' } });
  assert.deepEqual(fetch.calls[3].body, { app: { name: 'c.bas' } });
});

test('a language store finds by name within its language', async () => {
  const fetch = fakeFetch({ status: 200, body: [] });
  await new SourceStore({ ...TABLES.python, baseUrl: 'http://db.test', fetch }).findByName('a b');
  assert.equal(fetch.calls[0].url, 'http://db.test/apps?name=a%20b&language=python');
});

test('validation errors are reported readably', async () => {
  const s = store(fakeFetch({ status: 422, body: { errors: { name: ["can't be blank"] } } }));
  await assert.rejects(s.create({ name: '' }), (e) => e instanceof StoreError
    && e.status === 422 && e.message === "name can't be blank");
});

test('not found and network failures', async () => {
  const s = store(fakeFetch({ status: 404, body: { error: "Couldn't find App" } }, new TypeError('Failed to fetch')));
  await assert.rejects(s.get(9), /Couldn't find App/);
  await assert.rejects(s.list(), /Cannot reach the database server at http:\/\/db\.test/);
});

test('priority and compiled_code are sent in the record body', async () => {
  const fetch = fakeFetch({ status: 200, body: { id: 3, name: 'p.bas', priority: 5, compiled_code: '{}' } });
  await store(fetch).update(3, { name: 'p.bas', priority: 5, compiled_code: '{}' });
  assert.deepEqual(fetch.calls[0].body, { app: { name: 'p.bas', priority: 5, compiled_code: '{}' } });
});

test('the viewports store: find by name, content sent as a JSON object', async () => {
  const content = { format: 'fastblip-viewport', version: 1, widgets: [{ class: 'Label', text: 'hi' }], windows: [] };
  const fetch = fakeFetch(
    { status: 200, body: [{ id: 4, name: 'main screen', content }] },
    { status: 200, body: { id: 4, name: 'main screen', content } },
  );
  const s = new SourceStore({ resource: 'viewports', key: 'viewport', baseUrl: 'http://db.test', fetch });
  const [found] = await s.findByName('main screen');
  assert.deepEqual(found.content, content);
  await s.update(4, { content });
  assert.deepEqual(fetch.calls.map((c) => `${c.method} ${c.url}`), [
    'GET http://db.test/viewports?name=main%20screen',
    'PATCH http://db.test/viewports/4',
  ]);
  assert.deepEqual(fetch.calls[1].body, { viewport: { content } });
});
