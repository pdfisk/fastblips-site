// src/ui/app-list.js: the compiled apps shown by the Applications menu and
// the mobile app list, read from fake stores in place of the server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listApps, isCompiled, runUrl } from '../src/ui/app-list.js';
import { StoreError } from '../src/ui/db-client.js';

const store = (records) => ({ list: async () => records });
const failing = (message) => ({ list: async () => { throw new StoreError(message); } });

test('isCompiled: only records with non-empty compiled code', () => {
  assert.equal(isCompiled({ compiled_code: '{"format":1}' }), true);
  for (const code of [undefined, null, '', '   ', 42]) assert.equal(isCompiled({ compiled_code: code }), false);
  assert.equal(isCompiled(null), false);
});

test('listApps: compiled records of both tables, sorted by name ignoring case', async () => {
  const apps = await listApps({ stores: {
    basic: store([
      { id: 1, name: 'zebra', content: 'Print 1', compiled_code: 'c1' },
      { id: 2, name: 'draft', content: 'Print 2', compiled_code: null },
      { id: 3, name: 'Apple', content: 'Print 3', compiled_code: 'c3' },
      { id: 4, name: '  ', content: '', compiled_code: 'c4' },
    ]),
    python: store([
      { id: 1, name: 'mango', content: 'print(1)', compiled_code: 'p1' },
      { id: 2, name: 'apple', content: 'print(2)', compiled_code: 'p2' },
      { id: 3, name: 'plain', content: 'print(3)' },
    ]),
  } });
  assert.deepEqual(apps.map((a) => `${a.name}/${a.table}`), ['Apple/basic', 'apple/python', 'mango/python', 'zebra/basic']);
  assert.equal(apps[0].record.content, 'Print 3');
});

test('listApps: a table that cannot be read is skipped; both failing rejects', async () => {
  const apps = await listApps({ stores: { basic: failing('down'), python: store([{ name: 'p', compiled_code: 'x' }]) } });
  assert.deepEqual(apps.map((a) => a.name), ['p']);
  await assert.rejects(listApps({ stores: { basic: failing('no basic'), python: failing('no python') } }), /no basic/);
  assert.deepEqual(await listApps({ stores: { basic: store(null), python: store([]) } }), []);
});

test('runUrl: this page with ?run=<name>, keeping only db=', () => {
  assert.equal(runUrl('json-explorer', 'https://fastblips.com/?ui=mobile#x'), 'https://fastblips.com/?run=json-explorer');
  assert.equal(runUrl('my app', 'https://fastblips.com/index.html?db=local&ui=mobile'),
    'https://fastblips.com/index.html?run=my+app&db=local');
  assert.equal(runUrl('abc', 'https://fastblips.com/', 'peter'), 'https://fastblips.com/?run=peter%2Fabc');
});
