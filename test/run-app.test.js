// src/ui/run-app.js: which program a ?run= value names, read from fake
// stores in place of the server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findProgram, splitRunName, findProject, projectParameter, findApp, runParameter } from '../src/ui/run-app.js';

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

test('findProject: owner/name in that space, its scripts in order, as programs', async () => {
  const projects = store({
    peter: [{ id: 1, name: 'Demo', scripts: [{ id: 12 }, { id: 11 }, { id: 99 }] }],
    '': [{ id: 2, name: 'Shared', scripts: [] }],
  });
  const scripts = { list: async () => [
    { id: 11, name: 'A', language: 'python', content: 'print(1)', priority: 2 },
    { id: 12, name: 'B', language: 'basic', content: 'PRINT 2', compiled_code: '{}' },
  ] };
  const found = await findProject('peter/demo', { stores: { projects, scripts } });
  assert.equal(found.owner, 'peter');
  assert.deepEqual(found.programs.map((p) => p.name), ['B', 'A']);     // the project's order
  assert.equal(found.programs[0].compiled, '{}');
  assert.equal(found.programs[1].priority, 2);
  assert.equal(found.missing, 1);                                      // script 99 is gone
  assert.equal((await findProject('Shared', { stores: { projects, scripts } })).owner, '');
  assert.equal(await findProject('peter/nope', { stores: { projects, scripts } }), null);
});

test('projectParameter: the ?project= value, or null', () => {
  assert.equal(projectParameter({ location: { search: '?project=peter%2FDemo' } }), 'peter/Demo');
  assert.equal(projectParameter({ location: { search: '?run=abc' } }), null);
});

test('runParameter: ?app= first, the older ?run= as a fallback', () => {
  const at = (search) => runParameter({ location: { search } });
  assert.equal(at('?app=admin%2Fabc'), 'admin/abc');
  assert.equal(at('?app=admin/abc'), 'admin/abc');
  assert.equal(at('?run=abc'), 'abc');
  assert.equal(at('?app=a&run=b'), 'a');
  assert.equal(at('?project=abc'), null);
  assert.equal(at(''), null);
});

test('findApp: a project of that name, else a program, else null', async () => {
  const projects = store({ admin: [{ id: 1, name: 'abc', scripts: [{ id: 11 }] }] });
  const scripts = { list: async () => [{ id: 11, name: 'Main', language: 'basic', content: 'PRINT 1' }] };
  const basic = store({ admin: [{ id: 5, name: 'abc' }, { id: 6, name: 'solo' }] });
  const stores = { projects, scripts, basic, python: store({}) };

  const project = await findApp('admin/abc', { stores });    // project wins over a same-named program
  assert.equal(project.kind, 'project');
  assert.deepEqual(project.found.programs.map((p) => p.name), ['Main']);

  const program = await findApp('admin/solo', { stores });
  assert.equal(program.kind, 'program');
  assert.equal(program.found.record.id, 6);

  assert.equal(await findApp('admin/nope', { stores }), null);
});
