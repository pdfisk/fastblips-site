// src/ui/run-app.js: which program a ?run= value names, read from fake
// stores in place of the server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findProgram, splitRunName } from '../src/ui/run-app.js';

// A store whose records are per space: { '': [...], peter: [...] }.
const store = (spaces, owner = '') => ({
  list: async () => spaces[owner] ?? [],
  inSpace: (o) => store(spaces, o),
});

test('splitRunName: a user name, a slash and a name', () => {
  assert.deepEqual(splitRunName('peter/abc'), { owner: 'peter', name: 'abc' });
  assert.deepEqual(splitRunName('peter/games/pong'), { owner: 'peter', name: 'games/pong' });
  for (const value of ['abc', '/abc', 'peter/', 'not a user/abc']) assert.equal(splitRunName(value), null);
});

test('findProgram: owner/name in that space, a bare name in the shared space', async () => {
  const stores = {
    basic: store({ '': [{ id: 1, name: 'abc' }, { id: 2, name: 'docs/intro' }], peter: [{ id: 3, name: 'abc' }] }),
    python: store({ peter: [{ id: 4, name: 'Snake' }] }),
  };
  const id = async (value) => { const f = await findProgram(value, { stores }); return f && `${f.owner}#${f.record.id}`; };
  assert.equal(await id('abc'), '#1');
  assert.equal(await id('peter/abc'), 'peter#3');
  assert.equal(await id('peter/snake'), 'peter#4');
  assert.equal(await id('docs/intro'), '#2');      // a shared name with a slash
  assert.equal(await id('Snake'), null);           // peter's, not shared
  assert.equal(await id('ann/abc'), null);
});
