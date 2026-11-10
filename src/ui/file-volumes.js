// Volumes and the copy engine of the File Copy window: the part that needs no
// DOM, so it also runs (and is tested) under Node.
//
// A volume is a place that files can be listed in, read from and written to:
//
//   DirectoryVolume  a folder on this computer (a File System Access API
//                    directory handle: picked with showDirectoryPicker in
//                    Chrome or Edge, or the browser's private file system,
//                    which every modern browser has). It has folders.
//   DatabaseVolume   the scripts in one space (the signed-in user's) of
//                    a database: the desktop app's own, or a server, local
//                    or remote. A Python script is
//                    listed as name.py (scripts in any other language are not listed). It has
//                    no folders.
//   ProjectsVolume   the projects in one space (the signed-in user's: those
//                    My Projects shows) of a database server: each project a
//                    folder, its scripts the files in it (name.py). A new
//                    folder is a new project; deleting one deletes the project.
//
// Every volume has the same methods, all asynchronous. A path is an array of
// folder names ([] is the top); an entry is { name, dir, size, modified }
// (modified in milliseconds, or null), and a volume may add its own fields:
//
//   list(path)                 the entries in a folder
//   read(path, entry)          the entry's bytes, as a Uint8Array
//   write(path, name, bytes)   makes or replaces a file
//   mkdir(path, name)          makes a folder
//   remove(path, entry)        deletes a file, or a folder with all it holds
//
// transfer() copies (or moves) entries from one volume to another.

import {
  SourceStore, REMOTE_SERVER_URL, LOCAL_SERVER_URL, DESKTOP_SERVER_URL, spaceName, isDesktopApp,
} from './db-client.js';
import { projectScriptCopy } from './projects.js';

// ---------------------------------------------------------------- names

const LANGUAGE_EXTENSIONS = { python: ['.py'] };

/** The language a file name stands for ('python'), or null for any other kind of file. */
export function languageOf(fileName) {
  const lower = String(fileName).toLowerCase();
  for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (extensions.some((e) => lower.endsWith(e) && lower.length > e.length)) return language;
  }
  return null;
}

/** The name without a .py extension. */
export function stripExtension(fileName) {
  const name = String(fileName);
  return languageOf(name) ? name.slice(0, name.lastIndexOf('.')) : name;
}

/** The file name of a script: its name, with .py added unless it has the language's extension already. */
export function scriptFileName(script) {
  const name = String(script.name ?? '');
  const language = 'python';
  return languageOf(name) === language ? name : `${name}${LANGUAGE_EXTENSIONS[language][0]}`;
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** The entries in the order a pane shows them: folders first, then files, each by name. */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => (b.dir - a.dir)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.name.localeCompare(b.name));
}

/** A byte count as 1,234 or 12.3K or 4.5M. */
export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 10000) return String(bytes).replace(/\B(?=(\d{3})+$)/g, ',');
  const units = ['K', 'M', 'G', 'T'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n < 100 ? n.toFixed(1) : Math.round(n)}${units[i]}`;
}

// ---------------------------------------------------------------- directories

/** A folder on this computer, or in the browser's private file system, given a FileSystemDirectoryHandle. */
export class DirectoryVolume {
  /** @param {object} handle - the root folder; @param {{id?: string, label?: string}} [options] */
  constructor(handle, { id, label } = {}) {
    this.handle = handle;
    this.id = id ?? `dir:${handle.name}`;
    this.label = label ?? handle.name;
    this.folders = true;
  }

  async _folder(path, create = false) {
    let dir = this.handle;
    for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
    return dir;
  }

  async list(path) {
    const dir = await this._folder(path);
    const entries = [];
    for await (const handle of dir.values()) {
      if (handle.kind === 'directory') {
        entries.push({ name: handle.name, dir: true, size: null, modified: null });
      } else {
        let file = null;
        try { file = await handle.getFile(); } catch { /* listed without a size */ }
        entries.push({ name: handle.name, dir: false, size: file?.size ?? null, modified: file?.lastModified ?? null });
      }
    }
    return sortEntries(entries);
  }

  async read(path, entry) {
    const dir = await this._folder(path);
    const file = await (await dir.getFileHandle(entry.name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async write(path, name, bytes) {
    const dir = await this._folder(path);
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async mkdir(path, name) {
    await (await this._folder(path)).getDirectoryHandle(name, { create: true });
  }

  async remove(path, entry) {
    await (await this._folder(path)).removeEntry(entry.name, { recursive: entry.dir });
  }
}

// ---------------------------------------------------------------- databases

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** The scripts in one space of a database server, as files. */
export class DatabaseVolume {
  /**
   * @param {SourceStore} store - the scripts of one space of one server, in
   *   (resource 'scripts'; see db-client.js)
   * @param {{id?: string, label?: string|(() => string)}} [options]
   */
  constructor(store, { id = 'db', label = 'Database' } = {}) {
    this.store = store;
    this.id = id;
    this._label = label;
    this.folders = false;
  }

  get label() { return typeof this._label === 'function' ? this._label() : this._label; }

  async list() {
    const records = (await this.store.list()).filter((r) => r.language === 'python');
    return sortEntries(records.map((r) => ({
      name: scriptFileName(r),
      dir: false,
      size: encoder.encode(r.content ?? '').length,
      modified: r.updated_at ? Date.parse(r.updated_at) || null : null,
      id: r.id,
      language: r.language,
      record: r,
    })));
  }

  async read(path, entry) {
    let record = entry.record;
    if (record?.content === undefined) {
      const id = entry.id ?? (await this.store.list()).find((r) => same(scriptFileName(r), entry.name))?.id;
      if (id === undefined) throw new Error(`there is no script ${entry.name}`);
      record = await this.store.get(id);
    }
    return encoder.encode(record.content ?? '');
  }

  async write(path, name, bytes) {
    const language = languageOf(name);
    if (!language) throw new Error('a database keeps only scripts: .py files');
    let content;
    try { content = decoder.decode(bytes); } catch { throw new Error('it is not a text file, so a database cannot keep it'); }
    const records = await this.store.list();
    const stored = stripExtension(name);
    const existing = records.find((r) => same(scriptFileName(r), name));
    if (existing) {
      await this.store.update(existing.id, { content });
      return;
    }
    // A user's space allows one script to a name, whatever the language.
    const clash = this.store.space ? records.find((r) => same(r.name, stored)) : null;
    if (clash) throw new Error(`there is already a ${clash.language === 'python' ? 'Python' : clash.language} script called ${clash.name}`);
    await this.store.create({ name: stored, content, language });
  }

  async mkdir() { throw new Error('a database has no folders'); }

  async remove(path, entry) { await this.store.remove(entry.id); }
}

/**
 * The projects in one space of one server, as folders of their scripts: with
 * the store's owner the signed-in user, the projects My Projects shows for that
 * user on that server. Only projects of the store's space are listed (whatever
 * else the server answers with, as it does for an administrator).
 */
export class ProjectsVolume {
  /**
   * @param {SourceStore} store - the projects of one space of one server
   *   (resource 'projects', owner the user)
   * @param {{id?: string, label?: string|(() => string)}} [options]
   */
  constructor(store, { id = 'projects', label = 'Projects' } = {}) {
    this.store = store;
    this.id = id;
    this._label = label;
    this.folders = true;
  }

  get label() { return typeof this._label === 'function' ? this._label() : this._label; }

  async _projects() {
    const space = this.store.space;   // a user name, or null for every space
    return (await this.store.list() ?? [])
      .filter((p) => String(p?.name ?? '').trim() !== '')
      .filter((p) => space == null || same(String(p.owner ?? '').trim(), space));
  }

  async _project(name) {
    const found = (await this._projects()).find((p) => same(String(p.name).trim(), name));
    if (!found) throw new Error(`there is no project ${name}`);
    return found;
  }

  _inProject(path) {
    if (path.length !== 1) throw new Error(path.length ? 'a project has no folders' : 'scripts go in a project: open one first');
    return path[0];
  }

  async list(path) {
    if (path.length === 0) {
      return sortEntries((await this._projects()).map((project) => ({
        name: String(project.name).trim(),
        dir: true,
        size: null,
        modified: project.updated_at ? Date.parse(project.updated_at) || null : null,
        project,
      })));
    }
    const project = await this._project(this._inProject(path));
    const modified = project.updated_at ? Date.parse(project.updated_at) || null : null;
    return sortEntries((project.scripts ?? [])
      .filter((sc) => (sc.language ?? 'python') === 'python')
      .map((sc) => ({ name: scriptFileName(sc), dir: false, size: encoder.encode(sc.content ?? '').length, modified, script: sc })));
  }

  async read(path, entry) {
    const project = await this._project(this._inProject(path));
    const script = (project.scripts ?? []).find((sc) => same(scriptFileName(sc), entry.name));
    if (!script) throw new Error(`there is no script ${entry.name} in ${project.name}`);
    return encoder.encode(script.content ?? '');
  }

  async write(path, name, bytes) {
    const project = await this._project(this._inProject(path));
    const language = languageOf(name);
    if (!language) throw new Error('a project keeps only scripts: .py files');
    let content;
    try { content = decoder.decode(bytes); } catch { throw new Error('it is not a text file, so a project cannot keep it'); }
    const scripts = (project.scripts ?? []).map(projectScriptCopy);
    const existing = scripts.find((sc) => same(scriptFileName(sc), name));
    if (existing) existing.content = content;
    else scripts.push({ name: stripExtension(name), language, content });
    await this.store.update(project.id, { scripts });
  }

  /** At the top, makes a new, empty, unshared project; there are no folders in a project. */
  async mkdir(path, name) {
    if (path.length) throw new Error('a project has no folders');
    await this.store.create({ name, description: '', shared: false, scripts: [] });
  }

  /** At the top, deletes a project with its scripts; in a project, takes the script out. */
  async remove(path, entry) {
    if (path.length === 0) {
      await this.store.remove((await this._project(entry.name)).id);
      return;
    }
    const project = await this._project(this._inProject(path));
    const scripts = (project.scripts ?? []).map(projectScriptCopy);
    const kept = scripts.filter((sc) => !same(scriptFileName(sc), entry.name));
    if (kept.length === scripts.length) throw new Error(`there is no script ${entry.name} in ${project.name}`);
    await this.store.update(project.id, { scripts: kept });
  }
}

/**
 * The database volumes, in the order File Copy lists them: in the desktop
 * app, the signed-in user's scripts and projects in its own database (on
 * this computer) first; then on the local server, then on the remote one.
 * Copying between Desktop and Remote is how work moves to and from the
 * desktop database.
 * @param {{fetch?: typeof fetch, remoteUrl?: string, localUrl?: string,
 *          desktopUrl?: string, desktop?: boolean}} [options] - desktop says
 *   whether to list the desktop database (by default: in the desktop app)
 */
export function databaseVolumes({ fetch: fetchFn, remoteUrl = REMOTE_SERVER_URL, localUrl = LOCAL_SERVER_URL,
  desktopUrl = DESKTOP_SERVER_URL, desktop = isDesktopApp() } = {}) {
  const owner = () => spaceName();
  const user = () => spaceName() || 'no user';
  const scripts = (id, url, server) => new DatabaseVolume(
    new SourceStore({ resource: 'scripts', key: 'script', owner, baseUrl: url, fetch: fetchFn }),
    { id, label: () => `${server} database: ${user()}'s scripts` });
  const projects = (id, url, server) => new ProjectsVolume(
    new SourceStore({ resource: 'projects', key: 'project', owner, baseUrl: url, fetch: fetchFn }),
    { id, label: () => `${server} database: ${user()}'s projects` });
  return [
    ...(desktop ? [scripts('desktop-scripts', desktopUrl, 'Desktop'), projects('desktop-projects', desktopUrl, 'Desktop')] : []),
    scripts('local-scripts', localUrl, 'Local'),
    projects('local-projects', localUrl, 'Local'),
    scripts('remote-scripts', remoteUrl, 'Remote'),
    projects('remote-projects', remoteUrl, 'Remote'),
  ];
}

/** True where this browser can open a folder on the computer (Chrome and Edge). */
export const canPickFolder = () => typeof globalThis.showDirectoryPicker === 'function';

/** True where this browser has a private file system for the page. */
export const canUseBrowserFiles = () => typeof globalThis.navigator?.storage?.getDirectory === 'function';

// ---------------------------------------------------------------- transfer

/**
 * Copies (or, with move, moves) entries of one folder to another folder, folders with all
 * they hold. A name that already exists in the target is replaced only if ask(name) says so.
 * Mistakes with one entry are collected and the rest go on.
 *
 * @param {object} job
 * @param {object} job.from - the source volume
 * @param {string[]} job.fromPath - the source folder
 * @param {object[]} job.entries - entries of the source folder
 * @param {object} job.to - the target volume
 * @param {string[]} job.toPath - the target folder
 * @param {boolean} [job.move] - delete each source once it has been copied
 * @param {(name: string) => Promise<'overwrite'|'skip'|'overwrite-all'|'skip-all'|'cancel'>} [job.ask] -
 *   what to do with a file that exists (skip, if there is no ask)
 * @param {(message: string) => void} [job.progress] - told of each file as it is copied
 * @param {() => boolean} [job.stop] - asked before each file; true stops the job (the result is cancelled)
 * @returns {Promise<{copied: number, skipped: number, failed: {name: string, message: string}[], cancelled: boolean}>}
 */
export async function transfer({ from, fromPath, entries, to, toPath, move = false, ask, progress, stop }) {
  const result = { copied: 0, skipped: 0, failed: [], cancelled: false };
  if (from.id === to.id && fromPath.join('/') === toPath.join('/')) {
    throw new Error('the source and the target are the same folder');
  }
  let policy = null;   // 'overwrite' or 'skip' once All has been chosen

  const fail = (name, e) => result.failed.push({ name, message: e?.message || String(e) });

  // Copies one entry into the folder toFolder; true if it, and all it holds, was copied.
  async function copyEntry(entry, srcFolder, dstFolder, existing) {
    if (stop?.()) result.cancelled = true;
    if (result.cancelled) return false;
    const shown = [...srcFolder.slice(fromPath.length), entry.name].join('/');
    const clash = existing.find((e) => same(e.name, entry.name));
    try {
      if (entry.dir) {
        if (!to.folders) throw new Error('a database has no folders: copy the files in it');
        const own = [...srcFolder, entry.name];
        if (from.id === to.id && own.every((part, i) => dstFolder[i] === part)) {
          throw new Error('a folder cannot be copied into itself');
        }
        if (clash && !clash.dir) throw new Error('there is already a file with this name');
        if (!clash) await to.mkdir(dstFolder, entry.name);
        const inner = [...dstFolder, clash?.name ?? entry.name];
        const innerExisting = clash ? await to.list(inner) : [];
        let whole = true;
        for (const child of await from.list([...srcFolder, entry.name])) {
          if (!await copyEntry(child, [...srcFolder, entry.name], inner, innerExisting)) whole = false;
        }
        if (whole && move && !result.cancelled) await from.remove(srcFolder, entry);
        return whole && !result.cancelled;
      }
      if (clash) {
        if (clash.dir) throw new Error('there is already a folder with this name');
        let answer = policy ?? (ask ? await ask(shown) : 'skip');
        if (answer === 'overwrite-all') { policy = 'overwrite'; answer = 'overwrite'; }
        if (answer === 'skip-all') { policy = 'skip'; answer = 'skip'; }
        if (answer === 'cancel') { result.cancelled = true; return false; }
        if (answer !== 'overwrite') { result.skipped += 1; return false; }
      }
      progress?.(shown);
      const bytes = await from.read(srcFolder, entry);
      await to.write(dstFolder, clash?.name ?? entry.name, bytes);
      if (move) await from.remove(srcFolder, entry);
      result.copied += 1;
      return true;
    } catch (e) {
      fail(shown, e);
      return false;
    }
  }

  const existing = await to.list(toPath);
  for (const entry of entries) {
    await copyEntry(entry, fromPath, toPath, existing);
    if (result.cancelled) break;
  }
  return result;
}

/** Deletes entries (folders with all they hold); returns { deleted, failed: [{name, message}] }. */
export async function removeEntries(volume, path, entries) {
  const result = { deleted: 0, failed: [] };
  for (const entry of entries) {
    try {
      await volume.remove(path, entry);
      result.deleted += 1;
    } catch (e) {
      result.failed.push({ name: entry.name, message: e?.message || String(e) });
    }
  }
  return result;
}

/** A sentence about what a transfer or delete did, for the status line. */
export function describeResult(verb, result) {
  const n = result.copied ?? result.deleted ?? 0;
  const parts = [`${verb} ${n} file${n === 1 ? '' : 's'}`];
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  if (result.failed.length) {
    parts.push(`${result.failed.length} failed (${result.failed[0].name}: ${result.failed[0].message}${result.failed.length > 1 ? ', ...' : ''})`);
  }
  if (result.cancelled) parts.push('cancelled');
  return parts.join('; ');
}
