import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serverChoices, serverName, setServer, getServerUrl, isDesktopServer, accountServerUrl, isDesktopApp,
  DESKTOP_SERVER_URL, REMOTE_SERVER_URL, LOCAL_SERVER_URL, SourceStore,
} from '../src/ui/db-client.js';
import { ForumClient } from '../src/ui/forum-client.js';

// The desktop app's preload script sets window.fastblipsDesktop before the page runs.
const asDesktop = (on) => {
  if (on) globalThis.fastblipsDesktop = { isDesktop: true, platform: 'win32' };
  else delete globalThis.fastblipsDesktop;
};

test('in a browser: Remote and Local only; Remote by default; Desktop refused', () => {
  asDesktop(false);
  assert.equal(isDesktopApp(), false);
  assert.deepEqual(serverChoices().map(([n]) => n), ['remote', 'local']);
  assert.equal(serverName(), 'remote');
  assert.throws(() => setServer('desktop'), /unknown database server/);
});

test('in the desktop app: Desktop is offered first and is the default', () => {
  asDesktop(true);
  try {
    assert.deepEqual(serverChoices().map(([n]) => n), ['desktop', 'remote', 'local']);
    assert.equal(serverName(), 'desktop');
    assert.equal(getServerUrl(), DESKTOP_SERVER_URL);
    assert.equal(isDesktopServer(), true);
    assert.equal(new SourceStore({ resource: 'projects', key: 'project' }).baseUrl, 'fbdb://local');
  } finally { asDesktop(false); }
});

test('with Desktop chosen, accounts and the forum use the remote server', async () => {
  asDesktop(true);
  try {
    setServer('desktop');
    assert.equal(accountServerUrl(), REMOTE_SERVER_URL);
    const calls = [];
    const fetch = async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => '{"user":null,"groups":[]}' }; };
    await new ForumClient({ fetch }).overview();
    assert.deepEqual(calls, [`${REMOTE_SERVER_URL}/forum`]);
    setServer('local');
    assert.equal(accountServerUrl(), LOCAL_SERVER_URL, 'the local Rails server has its own forum');
    setServer('remote');
    assert.equal(isDesktopServer(), false);
  } finally { asDesktop(false); }
});

test('a Desktop choice made in the desktop app means nothing in a browser', () => {
  asDesktop(true);
  setServer('desktop');
  asDesktop(false);
  assert.equal(serverName(), 'remote');
  assert.equal(getServerUrl(), REMOTE_SERVER_URL);
});

// ---- Phase 4: moving work between the desktop database and the others

import { databaseVolumes } from '../src/ui/file-volumes.js';
import { setUser } from '../src/ui/db-client.js';

test('File Copy lists the desktop database first, in the desktop app only', () => {
  const noFetch = async () => { throw new Error('no network'); };
  asDesktop(true);
  try {
    setUser('peter');
    const vols = databaseVolumes({ fetch: noFetch });
    assert.deepEqual(vols.map((v) => v.id),
      ['desktop-scripts', 'desktop-projects', 'local-scripts', 'local-projects', 'remote-scripts', 'remote-projects']);
    assert.equal(vols[1].label, "Desktop database: peter's projects");
    assert.equal(vols[1].store.baseUrl, DESKTOP_SERVER_URL);
    assert.equal(vols[1].store.space, 'peter');
  } finally { asDesktop(false); setUser(''); }
  assert.equal(databaseVolumes({ fetch: noFetch }).length, 4, 'a browser has no desktop database');
});

test('a project copies from the desktop database to the remote one through File Copy', async () => {
  // Two in-memory "servers" answering as SourceStore expects.
  const server = () => {
    const rows = [];
    return async (url, init) => {
      const u = new URL(url);
      const id = Number(u.pathname.split('/')[2]);
      const body = init.body ? JSON.parse(init.body).project : null;
      let out = null; let status = 200;
      if (init.method === 'GET') out = id ? rows.find((r) => r.id === id) : rows.filter((r) => r.owner === u.searchParams.get('owner'));
      else if (init.method === 'POST') { out = { id: rows.length + 1, owner: body.owner ?? '', scripts: [], ...body }; rows.push(out); status = 201; }
      else if (init.method === 'PATCH') { out = Object.assign(rows.find((r) => r.id === id), body); }
      return { ok: true, status, text: async () => JSON.stringify(out) };
    };
  };
  const desktopFetch = server();
  const remoteFetch = server();
  const fetch = (url, init) => (String(url).startsWith('fbdb:') ? desktopFetch : remoteFetch)(url, init);
  asDesktop(true);
  setUser('peter');
  try {
    const vols = databaseVolumes({ fetch });
    const desktop = vols.find((v) => v.id === 'desktop-projects');
    const remote = vols.find((v) => v.id === 'remote-projects');
    await desktop.mkdir([], 'Offline game');
    await desktop.write(['Offline game'], 'main.py', new TextEncoder().encode('print("hi")'));
    const { transfer } = await import('../src/ui/file-volumes.js');
    const [entry] = await desktop.list([]);
    const result = await transfer({ from: desktop, fromPath: [], to: remote, toPath: [], entries: [entry] });
    assert.deepEqual(result.failed, []);
    const [copied] = await remote.list([]);
    assert.equal(copied.name, 'Offline game');
    assert.deepEqual((await remote.list(['Offline game'])).map((e) => e.name), ['main.py']);
  } finally { asDesktop(false); setUser(''); }
});

test('with the desktop database in use, a remote 401 points to File > FastBlips Account', async () => {
  asDesktop(true);
  try {
    setServer('desktop');
    const fetch = async () => ({ ok: false, status: 401, text: async () => '{"error":"sign in required"}' });
    const remote = new SourceStore({ resource: 'projects', key: 'project', baseUrl: REMOTE_SERVER_URL, fetch });
    await assert.rejects(remote.create({ name: 'x' }), /File > FastBlips Account/);
    const desktop = new SourceStore({ resource: 'projects', key: 'project', baseUrl: DESKTOP_SERVER_URL, fetch });
    await assert.rejects(desktop.create({ name: 'x' }), /File > Sign In/);
    setServer('remote');
  } finally { asDesktop(false); }
});
