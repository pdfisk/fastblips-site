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
    'GET http://db.test/basic_sources',
    'GET http://db.test/basic_sources/1',
    'POST http://db.test/basic_sources',
    'PATCH http://db.test/basic_sources/2',
    'DELETE http://db.test/basic_sources/2',
  ]);
  assert.deepEqual(fetch.calls[2].body, { basic_source: { name: 'b.bas', content: '' } });
  assert.deepEqual(fetch.calls[3].body, { basic_source: { name: 'c.bas' } });
});

test('validation errors are reported readably', async () => {
  const s = store(fakeFetch({ status: 422, body: { errors: { name: ["can't be blank"] } } }));
  await assert.rejects(s.create({ name: '' }), (e) => e instanceof StoreError
    && e.status === 422 && e.message === "name can't be blank");
});

test('not found and network failures', async () => {
  const s = store(fakeFetch({ status: 404, body: { error: "Couldn't find BasicSource" } }, new TypeError('Failed to fetch')));
  await assert.rejects(s.get(9), /Couldn't find BasicSource/);
  await assert.rejects(s.list(), /Cannot reach the database server at http:\/\/db\.test/);
});
