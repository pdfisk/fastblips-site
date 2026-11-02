import test from 'node:test';
import assert from 'node:assert/strict';

// A new session (page load) starts signed out, even if an earlier build left
// a user and tokens in localStorage.
test('a session starts signed out and clears remembered sign-ins', async () => {
  const saved = new Map([
    ['crumb.user', 'Peter'],
    ['crumb.tokens', JSON.stringify({ 'http://db.test': 'old-token' })],
  ]);
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => saved.get(k) ?? null,
    setItem: (k, v) => saved.set(k, String(v)),
    removeItem: (k) => saved.delete(k),
  };
  try {
    const db = await import(`../src/ui/db-client.js?fresh=${Date.now()}`);
    assert.equal(db.userName(), '');
    assert.equal(db.getToken('http://db.test'), '');
    assert.equal(saved.has('crumb.user'), false);
    assert.equal(saved.has('crumb.tokens'), false);
    db.setToken('tok', 'http://db.test');
    assert.equal(saved.has('crumb.tokens'), false);   // tokens are not stored
  } finally {
    globalThis.localStorage = previous;
  }
});
