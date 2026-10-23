import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, StoreError, TABLES, setUser, userName, setSpace, spaceName, registerUser, findUser, signIn, signOut, getToken, setToken } from '../src/ui/db-client.js';

// A fake fetch that records requests and answers from a list of responses.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
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
    'GET http://db.test/scripts?language=basic&owner=',
    'GET http://db.test/scripts/1',
    'POST http://db.test/scripts',
    'PATCH http://db.test/scripts/2',
    'DELETE http://db.test/scripts/2',
  ]);
  assert.deepEqual(fetch.calls[2].body, { script: { name: 'b.bas', content: '', language: 'basic' } });
  assert.deepEqual(fetch.calls[3].body, { script: { name: 'c.bas' } });
});

test('a language store finds by name within its language', async () => {
  const fetch = fakeFetch({ status: 200, body: [] });
  await new SourceStore({ ...TABLES.python, baseUrl: 'http://db.test', fetch }).findByName('a b');
  assert.equal(fetch.calls[0].url, 'http://db.test/scripts?name=a%20b&language=python&owner=');
});

test('stores work in the user\'s space; a ?run= page fixes the space', async () => {
  const fetch = fakeFetch({ status: 200, body: [] }, { status: 201, body: { id: 5 } },
    { status: 200, body: [] }, { status: 200, body: [] }, { status: 200, body: [] });
  const s = new SourceStore({ ...TABLES.basic, baseUrl: 'http://db.test', fetch });
  assert.equal(s.space, '');
  assert.throws(() => setUser('no spaces'), /user name/);
  setUser('Peter');
  try {
    assert.equal(userName(), 'Peter');
    await s.list();
    await s.create({ name: 'mine' });
    await s.inSpace('').findByName('x');
    setSpace('ann');
    assert.equal(spaceName(), 'ann');
    await s.list();
  } finally { setUser(''); setSpace(null); }
  await new SourceStore({ resource: 'scripts', key: 'script', baseUrl: 'http://db.test', fetch }).list();
  assert.deepEqual(fetch.calls.map((c) => c.url), [
    'http://db.test/scripts?language=basic&owner=Peter',
    'http://db.test/scripts',
    'http://db.test/scripts?name=x&language=basic&owner=',
    'http://db.test/scripts?language=basic&owner=ann',
    'http://db.test/scripts',
  ]);
  assert.deepEqual(fetch.calls[1].body, { script: { name: 'mine', language: 'basic', owner: 'Peter' } });
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
  assert.deepEqual(fetch.calls[0].body, { script: { name: 'p.bas', priority: 5, compiled_code: '{}' } });
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

test('registerUser posts the name and e-mail to /users', async () => {
  const fetch = fakeFetch({ status: 201, body: { id: 7, name: 'ann', email: 'ann@x.org' } });
  const user = await registerUser({ name: ' ann ', password: 'secret123', email: ' ann@x.org ' }, { baseUrl: 'http://db.test', fetch });
  assert.equal(user.id, 7);
  assert.equal(fetch.calls[0].method, 'POST');
  assert.equal(fetch.calls[0].url, 'http://db.test/users');
  assert.deepEqual(fetch.calls[0].body, { user: { name: 'ann', password: 'secret123', email: 'ann@x.org' } });
});

test('registerUser leaves out a blank e-mail and reports a taken name', async () => {
  const fetch = fakeFetch({ status: 422, body: { errors: { name: ['has already been taken'] } } });
  await assert.rejects(registerUser({ name: 'ann', password: 'secret123', email: '' }, { baseUrl: 'http://db.test', fetch }),
    (e) => e instanceof StoreError && e.status === 422 && e.message === 'name has already been taken');
  assert.deepEqual(fetch.calls[0].body, { user: { name: 'ann', password: 'secret123' } });
});

test('findUser gets the user by name, and answers null when nobody is registered', async () => {
  const fetch = fakeFetch({ status: 200, body: { id: 7, name: 'Ann' } }, { status: 404, body: { error: 'nope' } });
  assert.deepEqual(await findUser(' ann ', { baseUrl: 'http://db.test', fetch }), { id: 7, name: 'Ann' });
  assert.equal(await findUser('bob', { baseUrl: 'http://db.test', fetch }), null);
  assert.deepEqual(fetch.calls.map((c) => `${c.method} ${c.url}`),
    ['GET http://db.test/users/ann', 'GET http://db.test/users/bob']);
});

test('findUser still throws when the server fails', async () => {
  const fetch = fakeFetch({ status: 500, body: { error: 'boom' } });
  await assert.rejects(findUser('ann', { baseUrl: 'http://db.test', fetch }), (e) => e instanceof StoreError && e.status === 500);
});

test('a project is saved with its shared flag', async () => {
  const fetch = fakeFetch({ status: 201, body: { id: 1 } }, { status: 200, body: { id: 1 } });
  const s = new SourceStore({ resource: 'projects', key: 'project', baseUrl: 'http://db.test/', fetch });
  await s.create({ name: 'p', shared: true, script_ids: [] });
  await s.update(1, { shared: 0 });
  assert.deepEqual(fetch.calls[0].body, { project: { name: 'p', shared: true, script_ids: [] } });
  assert.deepEqual(fetch.calls[1].body, { project: { shared: false } });   // a boolean, always
});

test('a store sends the sign-in token of its server, and no other', async () => {
  setToken('', 'http://db.test'); setToken('', 'http://other.test');
  setToken('tok-1', 'http://db.test/');
  const fetch = fakeFetch({ status: 200, body: [] }, { status: 200, body: [] });
  await store(fetch).list();
  await new SourceStore({ ...TABLES.basic, baseUrl: 'http://other.test', fetch }).list();
  assert.deepEqual(fetch.calls.map((c) => c.auth), ['Bearer tok-1', undefined]);
  setToken('', 'http://db.test');
});

test('a write with no token is told to sign in; an expired token is forgotten', async () => {
  setToken('', 'http://db.test');
  let fetch = fakeFetch({ status: 401, body: { error: 'sign in required' } });
  await assert.rejects(store(fetch).create({ name: 'a.bas', content: '' }),
    (e) => e instanceof StoreError && e.status === 401 && /Sign in first/.test(e.message));
  setToken('old', 'http://db.test');
  fetch = fakeFetch({ status: 401, body: { error: 'the token is not valid or has expired: sign in again' } });
  await assert.rejects(store(fetch).create({ name: 'a.bas', content: '' }), /expired/);
  assert.equal(getToken('http://db.test'), '');
});

test('signIn posts the credentials to /session and keeps the token; signOut deletes it', async () => {
  setToken('', 'http://db.test');
  let fetch = fakeFetch({ status: 201, body: { token: 'tok-2', user: { id: 7, name: 'Ann', admin: false } } });
  const user = await signIn({ name: ' ann ', password: 'secret123' }, { baseUrl: 'http://db.test', fetch });
  assert.equal(user.name, 'Ann');
  assert.deepEqual(fetch.calls[0].body, { session: { name: 'ann', password: 'secret123' } });
  assert.equal(fetch.calls[0].url, 'http://db.test/session');
  assert.equal(getToken('http://db.test'), 'tok-2');
  fetch = fakeFetch({ status: 204 });
  await signOut({ baseUrl: 'http://db.test', fetch });
  assert.deepEqual([fetch.calls[0].method, fetch.calls[0].auth], ['DELETE', 'Bearer tok-2']);
  assert.equal(getToken('http://db.test'), '');
});

test('signIn reports a wrong password as the server words it, and keeps no token', async () => {
  setToken('', 'http://db.test');
  const fetch = fakeFetch({ status: 401, body: { error: 'wrong name or password' } });
  await assert.rejects(signIn({ name: 'ann', password: 'nope-nope' }, { baseUrl: 'http://db.test', fetch }), /wrong name or password/);
  assert.equal(getToken('http://db.test'), '');
});

test('registerUser keeps the token the server answers with', async () => {
  setToken('', 'http://db.test');
  const fetch = fakeFetch({ status: 201, body: { id: 1, name: 'ann', token: 'tok-3' } });
  await registerUser({ name: 'ann', password: 'secret123' }, { baseUrl: 'http://db.test', fetch });
  assert.equal(fetch.calls[0].body.user.password, 'secret123');
  assert.equal(getToken('http://db.test'), 'tok-3');
  setToken('', 'http://db.test');
});
