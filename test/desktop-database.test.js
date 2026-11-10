import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canBackUpDatabase, backUpDesktopDatabase, restoreDesktopDatabase, describeCounts,
} from '../src/ui/desktop-database.js';

const counts = { projects: 3, scripts: 1, viewports: 0 };

function withBridge(bridge, fn) {
  globalThis.fastblipsDesktop = { isDesktop: true, ...bridge };
  return Promise.resolve().then(fn).finally(() => { delete globalThis.fastblipsDesktop; });
}

test('only the desktop app offers Back Up and Restore', async () => {
  assert.equal(canBackUpDatabase(), false);
  await assert.rejects(backUpDesktopDatabase(), /Only the desktop app/);
  await withBridge({ backupDatabase() {}, restoreDatabase() {} }, () => assert.equal(canBackUpDatabase(), true));
});

test('a backup reports where it went and what it holds; cancelling is null', async () => {
  await withBridge({ backupDatabase: async () => ({ name: 'FastBlips backup.sqlite', counts }), restoreDatabase() {} }, async () => {
    const r = await backUpDesktopDatabase();
    assert.equal(r.message, 'Backed up to FastBlips backup.sqlite: 3 projects, 1 script, 0 saved screens');
  });
  await withBridge({ backupDatabase: async () => null, restoreDatabase() {} }, async () => {
    assert.equal(await backUpDesktopDatabase(), null);
  });
});

test('a restore tells every window to read again; an error comes back plain', async () => {
  const events = [];
  globalThis.document = { dispatchEvent: (e) => events.push(e.type) };
  try {
    await withBridge({ backupDatabase() {}, restoreDatabase: async () => ({ name: 'old.sqlite', counts }) }, async () => {
      const r = await restoreDesktopDatabase();
      assert.match(r.message, /^Restored old\.sqlite: 3 projects, 1 script, 0 saved screens/);
      assert.deepEqual(events, ['cr-dbserverchange']);
    });
    await withBridge({ backupDatabase() {},
      restoreDatabase: async () => { throw new Error("Error invoking remote method 'db:restore': DatabaseError: notes.txt is not a FastBlips database (not a SQLite file)"); } },
    async () => {
      await assert.rejects(restoreDesktopDatabase(), { message: 'notes.txt is not a FastBlips database (not a SQLite file)' });
    });
    assert.deepEqual(events, ['cr-dbserverchange'], 'nothing changed, so no reload');
  } finally { delete globalThis.document; }
});

test('describeCounts', () => {
  assert.equal(describeCounts({ projects: 1, scripts: 2, viewports: 1 }), '1 project, 2 scripts, 1 saved screen');
});
