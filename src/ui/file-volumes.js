// Volumes and the copy engine of the File Copy window: the part that needs no
// DOM, so it also runs (and is tested) under Node.
//
// A volume is a place that files can be listed in, read from and written to:
//
//   DirectoryVolume  a folder on this computer (a File System Access API
//                    directory handle: picked with showDirectoryPicker in
//                    Chrome or Edge, or the browser's private file system,
//                    which every modern browser has). It has folders.
//                    Every file it writes holds JSON text and has .json
//                    added to its name: a script (hello.py.json) holds the
//                    script record, any other file (notes.txt.json) its
//                    bytes. A folder that holds a project has the project
//                    record in project.json. See "JSON files" below.
//   DatabaseVolume   the scripts in one space (the signed-in user's) of
//                    the database in use. A Python script is listed as
//                    name.py (scripts in any other language are not
//                    listed). It has no folders.
//   ProjectsVolume   the projects in one space (the signed-in user's: those
//                    My Projects shows) of the database in use: each project a
//                    folder, its scripts the files in it (name.py). A new
//                    folder is a new project; deleting one deletes the project.
//
// Every volume has the same methods, all asynchronous. A path is an array of
// folder names ([] is the top); an entry is { name, dir, size, modified }
// (modified in milliseconds, or null), and a volume may add its own fields:
//
//   list(path)                    the entries in a folder
//   read(path, entry)             the entry's bytes, as a Uint8Array
//   readFile(path, entry)         { name, bytes, meta }: the bytes with the
//                                 record they came from (meta, or null)
//   write(path, name, bytes)      makes or replaces a file
//   writeFile(path, file)         the same, given { name, bytes, meta }, so
//                                 the record goes along
//   folderMeta(path, entry)       the record of a folder (a project), or null
//   mkdir(path, name, meta)       makes a folder (meta: its record, if any)
//   remove(path, entry)           deletes a file, or a folder with all it holds
//
// transfer() copies (or moves) entries from one volume to another.

import {
  SourceStore, spaceName, getServerUrl,
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

// ---------------------------------------------------------------- text

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// ---------------------------------------------------------------- records

/** The fields of a script record a copy keeps (besides its content). */
export const SCRIPT_FIELDS = ['name', 'language', 'priority', 'created_at', 'updated_at'];
/** The fields of a project record a copy keeps (besides the names of its scripts). */
export const PROJECT_FIELDS = ['name', 'description', 'shared', 'category', 'created_at', 'updated_at'];

/** The fields of o that are named in keys and have a value. */
function pick(o, keys) {
  return Object.fromEntries(keys.filter((k) => o?.[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
}

/** The record of a script (one of the scripts table, or one in a project), without its content. */
export function scriptMeta(script) {
  return { kind: 'script', ...pick({ language: 'python', ...script }, SCRIPT_FIELDS) };
}

/** The record of a project, with the names of its scripts in place of the scripts. */
export function projectMeta(project) {
  return {
    kind: 'project',
    ...pick(project, PROJECT_FIELDS),
    scripts: (project?.scripts ?? []).map((sc) => String(sc.name ?? '')),
  };
}

// ---------------------------------------------------------------- JSON files

/** What the format field of a local file in JSON text says. */
export const FILE_JSON_FORMAT = 'fastblips-file';
/** What is added to the name of every file written to a local folder. */
export const JSON_SUFFIX = '.json';
/** The file in a local folder that holds the record of the project the folder is. */
export const PROJECT_FILE = 'project.json';

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const stringify = (data) => `${JSON.stringify(data, null, 2)}\n`;

/**
 * The JSON text a local file holds for a file. A script (meta.kind 'script'):
 *   { "format": "fastblips-file", "version": 1, "kind": "script",
 *     "name": "hello", "language": "python", "priority": 3,
 *     "created_at": "...", "updated_at": "...",
 *     "encoding": "utf-8", "content": "print('hi')\n" }
 * Any other file: { "format", "version", "kind": "file", "name": "notes.txt", "encoding", "content" }.
 * UTF-8 text is kept as text; any other bytes are kept in base64 ("encoding": "base64").
 */
export function toFileJson(name, bytes, meta = null) {
  let encoding = 'utf-8';
  let content;
  try { content = decoder.decode(bytes); } catch { encoding = 'base64'; content = toBase64(bytes); }
  const head = meta?.kind === 'script'
    ? { kind: 'script', ...pick({ name: stripExtension(name), ...meta }, SCRIPT_FIELDS) }
    : { kind: 'file', name: String(name) };
  return stringify({ format: FILE_JSON_FORMAT, version: 1, ...head, encoding, content });
}

/** The JSON text of project.json for a project record (projectMeta). */
export function toProjectJson(meta) {
  return stringify({ format: FILE_JSON_FORMAT, version: 1, ...projectMeta({ ...meta, scripts: [] }), scripts: [...(meta?.scripts ?? [])] });
}

/** The parsed JSON of a local file, or null if the text is not a file of this format. */
export function parseFileJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== 'object' || data.format !== FILE_JSON_FORMAT) return null;
  if (data.kind === 'project') return data;
  return typeof data.content === 'string' ? data : null;
}

function contentBytes(data) {
  if (data.encoding === 'base64') return fromBase64(data.content);
  if (data.encoding === 'utf-8' || data.encoding === undefined) return encoder.encode(data.content);
  throw new Error(`the file is in an unknown encoding: ${data.encoding}`);
}

/** { bytes, meta } inside the JSON text of a local file (meta for a script, else null), or null if it is no such file. */
export function fromFileJson(text) {
  const data = parseFileJson(text);
  if (!data || data.kind === 'project') return null;
  return { bytes: contentBytes(data), meta: data.kind === 'script' ? scriptMeta(data) : null };
}

// ---------------------------------------------------------------- directories

const isJsonName = (fileName) => fileName.toLowerCase().endsWith(JSON_SUFFIX) && fileName.length > JSON_SUFFIX.length;

async function fileText(handle) {
  try { return decoder.decode(new Uint8Array(await (await handle.getFile()).arrayBuffer())); } catch { return null; }
}

/**
 * A folder on this computer, or in the browser's private file system, given a FileSystemDirectoryHandle.
 * A file is written as JSON text to its name with .json added, and listed by its name without it
 * (hello.py.json is listed as hello.py). A file that does not hold such JSON is listed and read as
 * it is, so files made elsewhere can still be copied. A folder's project.json is not listed.
 */
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
        continue;
      }
      let file = null;
      try { file = await handle.getFile(); } catch { /* listed without a size */ }
      const modified = file?.lastModified ?? null;
      const data = file && isJsonName(handle.name) ? parseFileJson(await fileText(handle)) : null;
      if (data?.kind === 'project') {
        if (same(handle.name, PROJECT_FILE)) continue;   // the folder's own record
      } else if (data) {
        let size = null;
        try { size = contentBytes(data).length; } catch { /* an unknown encoding */ }
        entries.push({
          name: handle.name.slice(0, -JSON_SUFFIX.length), fileName: handle.name, dir: false, size, modified,
          meta: data.kind === 'script' ? scriptMeta(data) : null,
        });
        continue;
      }
      entries.push({ name: handle.name, dir: false, size: file?.size ?? null, modified });
    }
    return sortEntries(entries);
  }

  /** The handle of the file of an entry: its fileName, else its name with .json, else its name. */
  async _fileHandle(dir, entry) {
    const names = [entry.fileName, `${entry.name}${JSON_SUFFIX}`, entry.name].filter(Boolean);
    for (const name of names.slice(0, -1)) {
      try { return await dir.getFileHandle(name); } catch { /* try the next */ }
    }
    return dir.getFileHandle(names.at(-1));
  }

  async readFile(path, entry) {
    const handle = await this._fileHandle(await this._folder(path), entry);
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    if (isJsonName(handle.name)) {
      let text = null;
      try { text = decoder.decode(bytes); } catch { /* not text, so not JSON */ }
      const inside = text === null ? null : fromFileJson(text);
      if (inside) return { name: handle.name.slice(0, -JSON_SUFFIX.length), ...inside };
    }
    return { name: handle.name, bytes, meta: null };
  }

  async read(path, entry) { return (await this.readFile(path, entry)).bytes; }

  async writeFile(path, { name, bytes, meta = null }) {
    const dir = await this._folder(path);
    const fileName = `${name}${JSON_SUFFIX}`;
    const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(toFileJson(name, bytes, meta));
    await writable.close();
    // A file of the same name that is not JSON is what this one replaces.
    if (await dir.getFileHandle(name).then(() => true, () => false)) await dir.removeEntry(name);
    if (languageOf(name)) {
      const scriptName = meta?.name ?? stripExtension(name);
      await this._updateProject(dir, (names) => (names.some((n) => same(n, scriptName)) ? names : [...names, scriptName]));
    }
  }

  async write(path, name, bytes) { await this.writeFile(path, { name, bytes, meta: null }); }

  async _readProject(dir) {
    let handle;
    try { handle = await dir.getFileHandle(PROJECT_FILE); } catch { return null; }
    const data = parseFileJson(await fileText(handle));
    return data?.kind === 'project' ? data : null;
  }

  async _writeProject(dir, meta) {
    const writable = await (await dir.getFileHandle(PROJECT_FILE, { create: true })).createWritable();
    await writable.write(toProjectJson(meta));
    await writable.close();
  }

  /** Changes the list of script names in the folder's project.json, if it has one. */
  async _updateProject(dir, change) {
    const project = await this._readProject(dir);
    if (project) await this._writeProject(dir, { ...project, scripts: change(project.scripts ?? []) });
  }

  async folderMeta(path, entry) {
    try { return await this._readProject(await this._folder([...path, entry.name])); } catch { return null; }
  }

  /** Makes a folder; with the record of a project, the folder gets a project.json (no scripts yet: each is added as it is written). */
  async mkdir(path, name, meta = null) {
    const dir = await (await this._folder(path)).getDirectoryHandle(name, { create: true });
    if (meta?.kind === 'project') await this._writeProject(dir, { ...meta, name, scripts: [] });
  }

  async remove(path, entry) {
    const dir = await this._folder(path);
    if (entry.dir) {
      await dir.removeEntry(entry.name, { recursive: true });
      return;
    }
    await dir.removeEntry((await this._fileHandle(dir, entry)).name);
    if (languageOf(entry.name)) {
      const scriptName = entry.meta?.name ?? stripExtension(entry.name);
      await this._updateProject(dir, (names) => names.filter((n) => !same(n, scriptName)));
    }
  }
}

// ---------------------------------------------------------------- databases

/** The priority in a record, if it is one a script can have (1 to 5). */
function priorityOf(meta) {
  const p = Number(meta?.priority);
  return Number.isInteger(p) && p >= 1 && p <= 5 ? p : undefined;
}

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

  async readFile(path, entry) {
    let record = entry.record;
    if (record?.content === undefined) {
      const id = entry.id ?? (await this.store.list()).find((r) => same(scriptFileName(r), entry.name))?.id;
      if (id === undefined) throw new Error(`there is no script ${entry.name}`);
      record = await this.store.get(id);
    }
    return { name: scriptFileName(record), bytes: encoder.encode(record.content ?? ''), meta: scriptMeta(record) };
  }

  async read(path, entry) { return (await this.readFile(path, entry)).bytes; }

  async writeFile(path, { name, bytes, meta = null }) {
    const language = languageOf(name);
    if (!language) throw new Error('a database keeps only scripts: .py files');
    let content;
    try { content = decoder.decode(bytes); } catch { throw new Error('it is not a text file, so a database cannot keep it'); }
    const priority = priorityOf(meta);
    const records = await this.store.list();
    const stored = stripExtension(name);
    const existing = records.find((r) => same(scriptFileName(r), name));
    if (existing) {
      await this.store.update(existing.id, { content, ...(priority ? { priority } : {}) });
      return;
    }
    // A user's space allows one script to a name, whatever the language.
    const clash = this.store.space ? records.find((r) => same(r.name, stored)) : null;
    if (clash) throw new Error(`there is already a ${clash.language === 'python' ? 'Python' : clash.language} script called ${clash.name}`);
    await this.store.create({ name: stored, content, language, ...(priority ? { priority } : {}) });
  }

  async write(path, name, bytes) { await this.writeFile(path, { name, bytes, meta: null }); }

  async folderMeta() { return null; }

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

  async readFile(path, entry) {
    const project = await this._project(this._inProject(path));
    const script = (project.scripts ?? []).find((sc) => same(scriptFileName(sc), entry.name));
    if (!script) throw new Error(`there is no script ${entry.name} in ${project.name}`);
    return { name: scriptFileName(script), bytes: encoder.encode(script.content ?? ''), meta: scriptMeta(script) };
  }

  async read(path, entry) { return (await this.readFile(path, entry)).bytes; }

  async writeFile(path, { name, bytes, meta = null }) {
    const project = await this._project(this._inProject(path));
    const language = languageOf(name);
    if (!language) throw new Error('a project keeps only scripts: .py files');
    let content;
    try { content = decoder.decode(bytes); } catch { throw new Error('it is not a text file, so a project cannot keep it'); }
    const priority = priorityOf(meta);
    const scripts = (project.scripts ?? []).map(projectScriptCopy);
    const existing = scripts.find((sc) => same(scriptFileName(sc), name));
    if (existing) {
      existing.content = content;
      if (priority) existing.priority = priority;
    } else {
      scripts.push({ name: stripExtension(name), language, content, ...(priority ? { priority } : {}) });
    }
    await this.store.update(project.id, { scripts });
  }

  async write(path, name, bytes) { await this.writeFile(path, { name, bytes, meta: null }); }

  /** At the top, the record of a project (projectMeta); there are no folders in a project. */
  async folderMeta(path, entry) {
    if (path.length) return null;
    return projectMeta(entry.project ?? await this._project(entry.name));
  }

  /**
   * At the top, makes a new, empty project: unshared, unless the record of the
   * project it is a copy of (meta) says otherwise. There are no folders in a project.
   */
  async mkdir(path, name, meta = null) {
    if (path.length) throw new Error('a project has no folders');
    await this.store.create({
      name,
      description: meta?.description ?? '',
      shared: meta?.shared === true,
      ...(meta?.category ? { category: meta.category } : {}),
      scripts: [],
    });
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
 * The two database volumes File Copy offers: the signed-in user's scripts and
 * projects on the database in use (Settings > Database; the desktop app's own
 * database in the desktop app). Both follow a change of user or of server.
 * @param {{fetch?: typeof fetch, baseUrl?: string|(() => string)}} [options]
 */
export function currentUserVolumes({ fetch: fetchFn, baseUrl = getServerUrl } = {}) {
  const owner = () => spaceName();
  const user = () => spaceName() || 'no user';
  return [
    new DatabaseVolume(new SourceStore({ resource: 'scripts', key: 'script', owner, baseUrl, fetch: fetchFn }),
      { id: 'scripts', label: () => `${user()}'s scripts` }),
    new ProjectsVolume(new SourceStore({ resource: 'projects', key: 'project', owner, baseUrl, fetch: fetchFn }),
      { id: 'projects', label: () => `${user()}'s projects` }),
  ];
}

/** True where this browser can open a folder on the computer (Chrome and Edge). */
export const canPickFolder = () => typeof globalThis.showDirectoryPicker === 'function';

/** True where this browser has a private file system for the page. */
export const canUseBrowserFiles = () => typeof globalThis.navigator?.storage?.getDirectory === 'function';

// ---------------------------------------------------------------- transfer

/** An entry's bytes with its record: by readFile where the volume has it, else by read. */
async function readEntry(volume, path, entry) {
  if (volume.readFile) return volume.readFile(path, entry);
  return { name: entry.name, bytes: await volume.read(path, entry), meta: null };
}

/**
 * Copies (or, with move, moves) entries of one folder to another folder, folders with all
 * they hold. A name that already exists in the target is replaced only if ask(name) says so.
 * Mistakes with one entry are collected and the rest go on. The record of each script and
 * project goes along where the target can keep it.
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
        if (!clash) await to.mkdir(dstFolder, entry.name, (await from.folderMeta?.(srcFolder, entry)) ?? null);
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
      const file = await readEntry(from, srcFolder, entry);
      const target = { ...file, name: clash?.name ?? entry.name };
      if (to.writeFile) await to.writeFile(dstFolder, target);
      else await to.write(dstFolder, target.name, target.bytes);
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
