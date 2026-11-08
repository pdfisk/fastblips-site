import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forumLink, setToken, getForumUrl, REMOTE_FORUM_URL } from '../src/ui/db-client.js';

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

const base = { baseUrl: 'http://db.test', forumUrl: 'http://forum.test/' };

test('the remote server goes with forum.fastblips.com', () => {
  assert.equal(getForumUrl(), REMOTE_FORUM_URL);
  assert.equal(REMOTE_FORUM_URL, 'https://forum.fastblips.com');
});

test('signed out, forumLink is the forum itself and asks the server nothing', async () => {
  setToken('', 'http://db.test');
  const fetch = fakeFetch();
  assert.equal(await forumLink({ ...base, fetch }), 'http://forum.test/');
  assert.equal(await forumLink({ ...base, fetch, returnTo: '/getting-started' }), 'http://forum.test/getting-started');
  assert.equal(fetch.calls.length, 0);
});

test('signed in, forumLink asks POST /forum_handoff with the token and returns its one-time url', async () => {
  setToken('tok', 'http://db.test');
  try {
    const fetch = fakeFetch({ status: 201, body: { url: 'http://forum.test/sso?code=abc' } });
    assert.equal(await forumLink({ ...base, fetch, returnTo: '/python' }), 'http://forum.test/sso?code=abc');
    assert.deepEqual(fetch.calls, [{ url: 'http://db.test/forum_handoff', method: 'POST', auth: 'Bearer tok', body: { return_to: '/python' } }]);
  } finally {
    setToken('', 'http://db.test');
  }
});

test('forumLink falls back to the forum itself when the server says no or cannot be reached', async () => {
  setToken('tok', 'http://db.test');
  try {
    assert.equal(await forumLink({ ...base, fetch: fakeFetch({ status: 401, body: { error: 'expired' } }) }), 'http://forum.test/');
    assert.equal(await forumLink({ ...base, fetch: fakeFetch(new Error('offline')) }), 'http://forum.test/');
    assert.equal(await forumLink({ ...base, fetch: fakeFetch({ status: 201, body: { url: 'javascript:alert(1)' } }) }), 'http://forum.test/');
  } finally {
    setToken('', 'http://db.test');
  }
});

test('forumLink ignores a returnTo that is not a path on the forum', async () => {
  setToken('', 'http://db.test');
  assert.equal(await forumLink({ ...base, fetch: fakeFetch(), returnTo: '//evil.example' }), 'http://forum.test/');
  assert.equal(await forumLink({ ...base, fetch: fakeFetch(), returnTo: 'https://evil.example' }), 'http://forum.test/');
});
