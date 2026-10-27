import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryProjects } from '../src/ui/projects.js';

const records = [
  { id: 1, name: 'Mine', owner: 'peter', shared: true },
  { id: 2, name: 'Theirs', owner: 'ann', shared: true },
  { id: 3, name: 'Private', owner: 'ann', shared: false },
  { id: 4, name: 'Common', owner: null, shared: true },
];

test('libraryProjects leaves out the signed-in user\'s own projects', () => {
  assert.deepEqual(libraryProjects(records, 'Peter').map((p) => p.name), ['Common', 'Theirs']);
});

test('libraryProjects lists every shared project when nobody is signed in', () => {
  assert.deepEqual(libraryProjects(records, '').map((p) => p.name), ['Common', 'Mine', 'Theirs']);
});
