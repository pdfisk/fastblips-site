import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serverChoices, databaseMenuChoices, isLocalMode, serverName, setServer, getServerUrl, isDesktopServer, accountServerUrl, isDesktopApp,
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

// Settings > Database: which choices the menu shows depends on the mode.
const servedFrom = (href) => {
  if (href) globalThis.location = { href, search: new URL(href).search };
  else delete globalThis.location;
};
const menuNames = () => databaseMenuChoices().map(([n]) => n);

test('Settings > Database in desktop mode: Desktop, Local and Remote', () => {
  asDesktop(true);
  try {
    assert.deepEqual(menuNames(), ['desktop', 'local', 'remote']);
    servedFrom('http://localhost:8080/');
    assert.deepEqual(menuNames(), ['desktop', 'local', 'remote'], 'desktop mode wins over local mode');
  } finally { asDesktop(false); servedFrom(null); }
});

test('Settings > Database in local mode (localhost:8080): Local and Remote', () => {
  try {
    servedFrom('http://localhost:8080/?app=peter/pong');
    assert.equal(isLocalMode(), true);
    assert.deepEqual(menuNames(), ['local', 'remote']);
  } finally { servedFrom(null); }
});

test('Settings > Database anywhere else: no choices', () => {
  try {
    servedFrom('https://fastblips.com/');
    assert.equal(isLocalMode(), false);
    assert.deepEqual(menuNames(), []);
    servedFrom('http://localhost:3000/');
    assert.deepEqual(menuNames(), [], 'only port 8080 is local mode');
    servedFrom(null);
    assert.deepEqual(menuNames(), []);
  } finally { servedFrom(null); }
});
