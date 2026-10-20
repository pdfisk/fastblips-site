// src/ui/file-volumes.js: the volumes of the File Copy window (folders and
// databases) and the engine that copies between them, against in-memory
// folders and an in-memory scripts table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DirectoryVolume, DatabaseVolume, transfer, removeEntries, describeResult,
  languageOf, stripExtension, scriptFileName, sortEntries, formatSize, databaseVolumes,
} from '../src/ui/file-volumes.js';

// ------------------------------------------------------------ fakes

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A FileSystemDirectoryHandle kept in memory. */
class MemDir {
  constructor(name = 'root') { this.kind = 'directory'; this.name = name; this.children = new Map(); }
  async getDirectoryHandle(name, { create = false } = {}) {
    let c = this.children.get(name);
    if (!c && create) { c = new MemDir(name); this.children.set(name, c); }
    if (!c || c.kind !== 'directory') throw new DOMException(`no folder ${name}`, 'NotFoundError');
    return c;
  }
  async getFileHandle(name, { create = false } = {}) {
    let c = this.children.get(name);
    if (!c && create) { c = new MemFile(name); this.children.set(name, c); }
    if (!c || c.kind !== 'file') throw new DOMException(`no file ${name}`, 'NotFoundError');
    return c;
  }
  async removeEntry(name, { recursive = false } = {}) {
    const c = this.children.get(name);
    if (!c) throw new DOMException(`no ${name}`, 'NotFoundError');
    if (c.kind === 'directory' && c.children.size && !recursive) throw new Error('folder is not empty');
    this.children.delete(name);
  }
  async *values() { yield* this.children.values(); }
}

class MemFile {
  constructor(name) { this.kind = 'file'; this.name = name; this.bytes = new Uint8Array(0); this.modified = 1700000000000; }
  async getFile() {
    const { bytes, modified, name } = this;
    return { name, size: bytes.length, lastModified: modified, arrayBuffer: async () => bytes.slice().buffer };
  }
  async createWritable() {
    const file = this;
    return {
      async write(data) { file.bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data); },
      async close() { file.modified = Date.now(); },
    };
  }
}

/** The scripts table of one space, with the server's one-name-per-user rule. */
class FakeStore {
  constructor(space = '', records = []) {
    this.space = space;
    this.records = records.map((r, i) => ({ id: i + 1, owner: space, ...r }));
    this.nextId = this.records.length + 1;
    this.calls = [];
  }
  async list() { return this.records.map((r) => ({ ...r })); }
  async get(id) { return { ...this.records.find((r) => r.id === id) }; }
  async create({ name, content, language }) {
    this.calls.push(['create', name, language]);
    if (this.space && this.records.some((r) => r.name === name)) throw new Error('name is already the name of one of this user\'s scripts');
    const record = { id: this.nextId++, name, content, language, owner: this.space };
    this.records.push(record);
    return record;
  }
  async update(id, fields) {
    this.calls.push(['update', id]);
    Object.assign(this.records.find((r) => r.id === id), fields);
  }
  async remove(id) { this.records = this.records.filter((r) => r.id !== id); }
}

async function put(dir, path, bytes) {
  let d = dir;
  const parts = path.split('/');
  const name = parts.pop();
  for (const part of parts) d = await d.getDirectoryHandle(part, { create: true });
  await (await d.getFileHandle(name, { create: true })).createWritable().then(async (w) => { await w.write(bytes); await w.close(); });
}

const text = async (vol, path, name) => dec.decode(await vol.read(path, { name }));
const names = async (vol, path = []) => (await vol.list(path)).map((e) => (e.dir ? `${e.name}/` : e.name));

// ------------------------------------------------------------ names

test('script file names carry the language in an extension', () => {
  assert.equal(languageOf('a.bas'), 'basic');
  assert.equal(languageOf('a.BAS'), 'basic');
  assert.equal(languageOf('a.py'), 'python');
  assert.equal(languageOf('.py'), null);
  assert.equal(languageOf('a.txt'), null);
  assert.equal(stripExtension('hello.bas'), 'hello');
  assert.equal(stripExtension('notes.txt'), 'notes.txt');
  assert.equal(scriptFileName({ name: 'hello', language: 'basic' }), 'hello.bas');
  assert.equal(scriptFileName({ name: 'hello', language: 'python' }), 'hello.py');
  assert.equal(scriptFileName({ name: 'hello.py', language: 'python' }), 'hello.py');
  assert.equal(scriptFileName({ name: 'hello.py', language: 'basic' }), 'hello.py.bas');
});

test('entries sort folders first, then by name; sizes are short', () => {
  const sorted = sortEntries([{ name: 'b', dir: false }, { name: 'Z', dir: true }, { name: 'a', dir: false }, { name: 'c', dir: true }]);
  assert.deepEqual(sorted.map((e) => e.name), ['c', 'Z', 'a', 'b']);
  assert.equal(formatSize(null), '');
  assert.equal(formatSize(999), '999');
  assert.equal(formatSize(1234), '1,234');
  assert.equal(formatSize(20480), '20.0K');
  assert.equal(formatSize(5 * 1024 * 1024), '5.0M');
});

// ------------------------------------------------------------ folders

test('a DirectoryVolume lists, reads, writes, makes folders and deletes', async () => {
  const root = new MemDir();
  const vol = new DirectoryVolume(root, { id: 'a', label: 'A' });
  await vol.write([], 'one.txt', enc.encode('hello'));
  await vol.mkdir([], 'sub');
  await vol.write(['sub'], 'two.txt', enc.encode('there'));
  assert.deepEqual(await names(vol), ['sub/', 'one.txt']);
  const [folder, file] = await vol.list([]);
  assert.equal(folder.dir, true);
  assert.equal(file.size, 5);
  assert.equal(typeof file.modified, 'number');
  assert.equal(await text(vol, [], 'one.txt'), 'hello');
  assert.equal(await text(vol, ['sub'], 'two.txt'), 'there');
  await vol.remove([], file);
  await vol.remove([], folder);   // with what is in it
  assert.deepEqual(await names(vol), []);
  await assert.rejects(vol.list(['nowhere']));
});

// ------------------------------------------------------------ databases

test('a DatabaseVolume lists scripts as files and reads, writes and deletes them', async () => {
  const store = new FakeStore('peter', [
    { name: 'hello', language: 'basic', content: 'Print 1' },
    { name: 'tool.py', language: 'python', content: 'print(2)' },
  ]);
  const vol = new DatabaseVolume(store, { id: 'db', label: 'DB' });
  assert.equal(vol.folders, false);
  assert.deepEqual(await names(vol), ['hello.bas', 'tool.py']);
  assert.equal((await vol.list([]))[0].size, 7);
  const entries = await vol.list([]);
  assert.equal(dec.decode(await vol.read([], entries[0])), 'Print 1');
  assert.equal(dec.decode(await vol.read([], entries[1])), 'print(2)');

  await vol.write([], 'new.py', enc.encode('print(3)'));
  assert.deepEqual(store.calls.at(-1), ['create', 'new', 'python']);
  assert.equal(store.records.at(-1).owner, 'peter');
  await vol.write([], 'hello.bas', enc.encode('Print 9'));   // replaces
  assert.deepEqual(store.calls.at(-1), ['update', 1]);
  assert.equal(store.records[0].content, 'Print 9');
  assert.equal(store.records.length, 3);

  await vol.remove([], (await vol.list([])).find((e) => e.name === 'new.py'));
  assert.equal(store.records.length, 2);
  await assert.rejects(vol.mkdir([], 'x'), /no folders/);
});

test('a database refuses what is not a text script, or a name another language has', async () => {
  const store = new FakeStore('peter', [{ name: 'hello', language: 'basic', content: 'x' }]);
  const vol = new DatabaseVolume(store);
  await assert.rejects(vol.write([], 'photo.png', enc.encode('x')), /only scripts/);
  await assert.rejects(vol.write([], 'bin.py', new Uint8Array([0xff, 0xfe, 0x00, 0xc3])), /not a text file/);
  await assert.rejects(vol.write([], 'hello.py', enc.encode('x')), /already a Basic script called hello/);
  assert.equal(store.records.length, 1);
  // The shared space allows repeats.
  const shared = new DatabaseVolume(new FakeStore('', [{ name: 'hello', language: 'basic', content: 'x' }]));
  await shared.write([], 'hello.py', enc.encode('y'));
  assert.equal(shared.store.records.length, 2);
});

test('databaseVolumes makes the user\'s and the shared scripts of both servers', () => {
  const vols = databaseVolumes({ fetch: async () => { throw new Error('no network'); }, remoteUrl: 'http://r', localUrl: 'http://l' });
  assert.deepEqual(vols.map((v) => v.id), ['remote-mine', 'remote-shared', 'local-mine', 'local-shared']);
  assert.equal(vols[1].store.space, '');
  assert.equal(vols[0].store.baseUrl, 'http://r');
  assert.equal(vols[3].store.baseUrl, 'http://l');
  assert.match(vols[1].label, /Remote database: shared/);
});

// ------------------------------------------------------------ transfer

async function twoFolders() {
  const a = new DirectoryVolume(new MemDir(), { id: 'a', label: 'A' });
  const b = new DirectoryVolume(new MemDir(), { id: 'b', label: 'B' });
  await a.write([], 'one.txt', enc.encode('1'));
  await a.write([], 'two.txt', enc.encode('2'));
  await a.mkdir([], 'dir');
  await a.write(['dir'], 'in.txt', enc.encode('inside'));
  await a.mkdir(['dir'], 'deep');
  await a.write(['dir', 'deep'], 'x.txt', enc.encode('deep'));
  return { a, b };
}

test('transfer copies files and folders with all they hold', async () => {
  const { a, b } = await twoFolders();
  const result = await transfer({ from: a, fromPath: [], entries: await a.list([]), to: b, toPath: [] });
  assert.deepEqual({ copied: result.copied, skipped: result.skipped, failed: result.failed, cancelled: result.cancelled },
    { copied: 4, skipped: 0, failed: [], cancelled: false });
  assert.deepEqual(await names(b), ['dir/', 'one.txt', 'two.txt']);
  assert.equal(await text(b, ['dir', 'deep'], 'x.txt'), 'deep');
  assert.deepEqual(await names(a), ['dir/', 'one.txt', 'two.txt'], 'the source is untouched');
});

test('transfer with move deletes what it copied', async () => {
  const { a, b } = await twoFolders();
  const result = await transfer({ from: a, fromPath: [], entries: await a.list([]), to: b, toPath: [], move: true });
  assert.equal(result.copied, 4);
  assert.deepEqual(await names(a), []);
  assert.deepEqual(await names(b), ['dir/', 'one.txt', 'two.txt']);
});

test('transfer asks before replacing, and obeys Overwrite, Skip, the All answers and Cancel', async () => {
  for (const [answers, expectOne, expectTwo, copied, skipped, cancelled] of [
    [['overwrite', 'overwrite'], '1', '2', 2, 0, false],
    [['skip', 'skip'], 'old1', 'old2', 0, 2, false],
    [['overwrite', 'skip'], '1', 'old2', 1, 1, false],
    [['overwrite-all'], '1', '2', 2, 0, false],
    [['skip-all'], 'old1', 'old2', 0, 2, false],
    [['cancel'], 'old1', 'old2', 0, 0, true],
  ]) {
    const { a, b } = await twoFolders();
    await b.write([], 'one.txt', enc.encode('old1'));
    await b.write([], 'two.txt', enc.encode('old2'));
    const asked = [];
    const files = (await a.list([])).filter((e) => !e.dir);
    const result = await transfer({
      from: a, fromPath: [], entries: files, to: b, toPath: [],
      ask: async (name) => { asked.push(name); return answers[asked.length - 1]; },
    });
    const label = answers.join();
    assert.equal(await text(b, [], 'one.txt'), expectOne, label);
    assert.equal(await text(b, [], 'two.txt'), expectTwo, label);
    assert.equal(result.copied, copied, label);
    assert.equal(result.skipped, skipped, label);
    assert.equal(result.cancelled, cancelled, label);
    assert.equal(asked.length, Math.min(answers.length, 2), label);
  }
});

test('transfer without a question leaves existing files alone, and matches names ignoring case', async () => {
  const { a, b } = await twoFolders();
  await b.write([], 'ONE.TXT', enc.encode('keep'));
  const result = await transfer({ from: a, fromPath: [], entries: (await a.list([])).filter((e) => e.name === 'one.txt'), to: b, toPath: [] });
  assert.equal(result.skipped, 1);
  assert.equal(await text(b, [], 'ONE.TXT'), 'keep');
  assert.deepEqual(await names(b), ['ONE.TXT']);
});

test('moving a skipped file keeps the source, and so does the folder around it', async () => {
  const { a, b } = await twoFolders();
  await b.mkdir([], 'dir');
  await b.write(['dir'], 'in.txt', enc.encode('old'));
  const result = await transfer({ from: a, fromPath: [], entries: (await a.list([])).filter((e) => e.dir), to: b, toPath: [], move: true });
  assert.equal(result.skipped, 1);
  assert.equal(result.copied, 1);   // deep/x.txt
  assert.equal(await text(a, ['dir'], 'in.txt'), 'inside');
  assert.equal(await text(b, ['dir'], 'in.txt'), 'old');
  assert.deepEqual(await names(a, ['dir']), ['deep/', 'in.txt'].filter((n) => n !== 'deep/'));   // deep moved away
  assert.equal(await text(b, ['dir', 'deep'], 'x.txt'), 'deep');
});

test('transfer refuses the same folder, and a folder copied into itself', async () => {
  const { a } = await twoFolders();
  await assert.rejects(transfer({ from: a, fromPath: [], entries: await a.list([]), to: a, toPath: [] }), /same folder/);
  const dirs = (await a.list([])).filter((e) => e.dir);
  const result = await transfer({ from: a, fromPath: [], entries: dirs, to: a, toPath: ['dir', 'deep'] });
  assert.equal(result.copied, 0);
  assert.match(result.failed[0].message, /into itself/);
  // ...but a folder beside one with a similar name is not itself.
  await a.mkdir([], 'dir2');
  const ok = await transfer({ from: a, fromPath: [], entries: dirs, to: a, toPath: ['dir2'] });
  assert.equal(ok.failed.length, 0);
  assert.equal(await text(a, ['dir2', 'dir'], 'in.txt'), 'inside');
});

test('a folder over a file, or a file over a folder, is a mistake of that entry only', async () => {
  const { a, b } = await twoFolders();
  await b.write([], 'dir', enc.encode('i am a file'));
  await b.mkdir([], 'one.txt');
  const result = await transfer({ from: a, fromPath: [], entries: await a.list([]), to: b, toPath: [] });
  assert.deepEqual(result.failed.map((f) => f.name).sort(), ['dir', 'one.txt']);
  assert.equal(result.copied, 1);   // two.txt
});

test('folders to or from a database: files go, folders and non-scripts are reported', async () => {
  const dir = new DirectoryVolume(new MemDir(), { id: 'd', label: 'D' });
  const store = new FakeStore('peter');
  const db = new DatabaseVolume(store, { id: 'db', label: 'DB' });
  await dir.write([], 'a.bas', enc.encode('Print "a"'));
  await dir.write([], 'b.py', enc.encode('print("b")'));
  await dir.write([], 'c.txt', enc.encode('not a script'));
  await dir.mkdir([], 'folder');
  const result = await transfer({ from: dir, fromPath: [], entries: await dir.list([]), to: db, toPath: [] });
  assert.equal(result.copied, 2);
  assert.deepEqual(result.failed.map((f) => f.name).sort(), ['c.txt', 'folder']);
  assert.match(result.failed.find((f) => f.name === 'folder').message, /no folders/);
  assert.deepEqual(store.records.map((r) => [r.name, r.language]), [['a', 'basic'], ['b', 'python']]);

  // and back out, to another folder
  const other = new DirectoryVolume(new MemDir(), { id: 'o', label: 'O' });
  const back = await transfer({ from: db, fromPath: [], entries: await db.list([]), to: other, toPath: [] });
  assert.equal(back.copied, 2);
  assert.deepEqual(await names(other), ['a.bas', 'b.py']);
  assert.equal(await text(other, [], 'a.bas'), 'Print "a"');
});

test('copying between two databases, local to remote, and moving', async () => {
  const local = new DatabaseVolume(new FakeStore('peter', [
    { name: 'one', language: 'basic', content: '1' }, { name: 'two', language: 'python', content: '2' }]), { id: 'l', label: 'L' });
  const remote = new DatabaseVolume(new FakeStore('peter', [{ name: 'one', language: 'basic', content: 'older' }]), { id: 'r', label: 'R' });
  const result = await transfer({
    from: local, fromPath: [], entries: await local.list([]), to: remote, toPath: [], move: true,
    ask: async () => 'overwrite',
  });
  assert.equal(result.copied, 2);
  assert.equal(local.store.records.length, 0);
  assert.deepEqual(remote.store.records.map((r) => [r.name, r.content]), [['one', '1'], ['two', '2']]);
});

test('stop ends a transfer between files, and progress hears of each file', async () => {
  const { a, b } = await twoFolders();
  const seen = [];
  let n = 0;
  const result = await transfer({
    from: a, fromPath: [], entries: (await a.list([])).filter((e) => !e.dir), to: b, toPath: [],
    progress: (name) => seen.push(name), stop: () => (n += 1) > 1,
  });
  assert.equal(result.copied, 1);
  assert.equal(result.cancelled, true);
  assert.deepEqual(seen, ['one.txt']);
});

test('one entry that cannot be read does not stop the others', async () => {
  const { a, b } = await twoFolders();
  const read = a.read.bind(a);
  a.read = async (path, entry) => { if (entry.name === 'one.txt') throw new Error('locked'); return read(path, entry); };
  const result = await transfer({ from: a, fromPath: [], entries: (await a.list([])).filter((e) => !e.dir), to: b, toPath: [] });
  assert.deepEqual(result.failed, [{ name: 'one.txt', message: 'locked' }]);
  assert.equal(result.copied, 1);
  assert.match(describeResult('Copied', result), /Copied 1 file; 1 failed \(one\.txt: locked\)/);
});

test('removeEntries deletes what it can and reports the rest', async () => {
  const { a } = await twoFolders();
  const remove = a.remove.bind(a);
  a.remove = async (path, entry) => { if (entry.name === 'two.txt') throw new Error('in use'); return remove(path, entry); };
  const result = await removeEntries(a, [], await a.list([]));
  assert.equal(result.deleted, 2);
  assert.deepEqual(result.failed, [{ name: 'two.txt', message: 'in use' }]);
  assert.deepEqual(await names(a), ['two.txt']);
  assert.equal(describeResult('Deleted', result), 'Deleted 2 files; 1 failed (two.txt: in use)');
});
