// SourceStore: a small client for the Rails API in rails/server, which
// exposes JSON CRUD for its tables. Programs are in one table, scripts, whatever
// their language; a store given a language reads and makes only the scripts in
// that language (the server's ?language= filter).
//
// Names belong to a user's space: a store given an owner reads and makes only
// the records in that space (the server's ?owner= filter). The owner '' is
// the shared space, the records that have no owner.
//
//   GET    /<resource>          list (records ordered by id; ?name= filters)
//   GET    /<resource>/:id      one record
//   POST   /<resource>          create   body: { <key>: { name, content } }
//   PATCH  /<resource>/:id      update   body: { <key>: { name, content } }
//   DELETE /<resource>/:id      delete   (204 No Content)
//
// No DOM is needed, so it also runs (and is tested) under Node.

/** The deployed (Heroku) server: the default. */
export const REMOTE_SERVER_URL = 'https://fastblip-e2ba34b072c4.herokuapp.com';

/** A server running on this machine, chosen with ?db=local. */
export const LOCAL_SERVER_URL = 'http://localhost:3000';

/**
 * The tables the Views menu offers: the scripts table, one language each.
 * (Each language had a table of its own before the server merged them.)
 */
export const TABLES = {
  basic: { resource: 'scripts', key: 'script', language: 'basic', title: 'Basic', owner: spaceName },
  python: { resource: 'scripts', key: 'script', language: 'python', title: 'Python', owner: spaceName },
};

/** The servers Settings > Database offers: [name, label, url]. */
export const SERVERS = [
  ['remote', 'Remote', REMOTE_SERVER_URL],
  ['local', 'Local', LOCAL_SERVER_URL],
];
const STORAGE_KEY = 'crumb.dbServer';
let chosen = null;   // set by setServer() on this page

/**
 * The server in use, 'remote' or 'local': the one chosen in Settings on this
 * page, else a db=local query parameter, else the choice remembered from an
 * earlier visit, else 'remote'.
 */
export function serverName() {
  if (chosen) return chosen;
  try {
    if (new URLSearchParams(globalThis.location.search).get('db')?.trim().toLowerCase() === 'local') return 'local';
  } catch { /* no location */ }
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'local' || saved === 'remote') return saved;
  } catch { /* storage blocked */ }
  return 'remote';
}

/** The URL of the server in use. */
export function getServerUrl() {
  return serverName() === 'local' ? LOCAL_SERVER_URL : REMOTE_SERVER_URL;
}

/**
 * Switches to the 'remote' or 'local' server, remembers the choice for the
 * next visit and announces it with a cr-dbserverchange event on document.
 */
export function setServer(name) {
  if (name !== 'local' && name !== 'remote') throw new Error(`unknown database server '${name}'`);
  chosen = name;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, name); } catch { /* not remembered */ }
  globalThis.document?.dispatchEvent(new CustomEvent('cr-dbserverchange',
    { detail: { name, url: getServerUrl() } }));
}

/** What a user name may be: 2 to 30 letters, digits, - or _ (as on the server). */
export const USER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,29}$/i;
const USER_KEY = 'crumb.user';
let user = null;        // set by setUser() on this page
let pageSpace = null;   // set by setSpace() on this page

/**
 * The user this browser works as (Settings > User), or '' for none: the one
 * chosen on this page, else the one remembered from an earlier visit. There
 * is no sign-in yet, so this is only a name.
 */
export function userName() {
  if (user !== null) return user;
  try {
    const saved = globalThis.localStorage?.getItem(USER_KEY)?.trim() ?? '';
    if (USER_NAME_PATTERN.test(saved)) return saved;
  } catch { /* storage blocked */ }
  return '';
}

/**
 * Switches user ('' for none), remembers the choice for the next visit and
 * announces it with a cr-userchange event on document.
 */
export function setUser(name) {
  name = String(name ?? '').trim();
  if (name && !USER_NAME_PATTERN.test(name)) {
    throw new Error('a user name is 2 to 30 letters, digits, - or _, starting with a letter or digit');
  }
  user = name;
  try {
    if (name) globalThis.localStorage?.setItem(USER_KEY, name);
    else globalThis.localStorage?.removeItem(USER_KEY);
  } catch { /* not remembered */ }
  globalThis.document?.dispatchEvent(new CustomEvent('cr-userchange', { detail: { name } }));
}

/**
 * The space this page reads and saves in: the user's, or '' for the shared
 * one. A ?run= page sets it to the space of the app it runs (setSpace), so
 * the screens the app loads by name are its owner's, whoever is looking.
 */
export function spaceName() { return pageSpace ?? userName(); }

/** Fixes this page's space to owner's ('' for shared); null follows the user again. */
export function setSpace(owner) { pageSpace = owner == null ? null : String(owner).trim(); }

function trimUrl(url) { return String(url).trim().replace(/\/+$/, ''); }

/** An error from the server or the network, with a readable message. */
export class StoreError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
    this.details = details;
  }
}

export class SourceStore {
  /**
   * @param {{resource: string, key: string, language?: string,
   *          owner?: string|(() => string),
   *          baseUrl?: string|(() => string), fetch?: typeof fetch}} options -
   *   language limits the store to the records in that language, and is set
   *   on the records it creates. owner does the same for a user's space
   *   ('' is the shared space); without it the store reads every space.
   *   owner and baseUrl may be functions, so a changed user or server is
   *   picked up by stores that already exist.
   */
  constructor({ resource, key, language, owner, baseUrl = getServerUrl, fetch: fetchFn } = {}) {
    if (!resource || !key) throw new TypeError('SourceStore needs a resource and a key');
    this.resource = resource;
    this.key = key;
    this.language = language ?? null;
    this._owner = owner;
    this._baseUrl = baseUrl;
    this._fetch = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  get baseUrl() {
    return trimUrl(typeof this._baseUrl === 'function' ? this._baseUrl() : this._baseUrl);
  }

  /** The space the store works in: a user name, '' for shared, or null for every space. */
  get space() {
    const owner = typeof this._owner === 'function' ? this._owner() : this._owner;
    return owner == null ? null : String(owner).trim();
  }

  /** A store like this one, working in owner's space ('' for shared). */
  inSpace(owner) {
    return new SourceStore({ resource: this.resource, key: this.key, language: this.language ?? undefined,
      owner: String(owner ?? ''), baseUrl: this._baseUrl, fetch: this._fetch });
  }

  /** Every record (in the store's language and space, if it has them), ordered by id. */
  list() { return this._request('GET', this._query({})); }

  /** The records called name (the server's ?name= filter). */
  findByName(name) { return this._request('GET', this._query({ name })); }

  /** The record with this id. */
  get(id) { return this._request('GET', `/${encodeURIComponent(id)}`); }

  /** Creates a record from { name, content } and returns it (with its id). */
  create(fields) {
    const body = this._body(fields);
    if (this.language) body[this.key].language = this.language;
    if (this.space) body[this.key].owner = this.space;
    return this._request('POST', '', body);
  }

  /** Updates the given fields of a record and returns the record. */
  update(id, fields) { return this._request('PATCH', `/${encodeURIComponent(id)}`, this._body(fields)); }

  /** Deletes a record. */
  async remove(id) { await this._request('DELETE', `/${encodeURIComponent(id)}`); }

  // "?name=...&language=...&owner=...", or "" with none. "owner=" with no
  // name asks for the shared space.
  _query(filters) {
    const space = this.space;
    const all = { ...filters, ...(this.language ? { language: this.language } : {}),
      ...(space === null ? {} : { owner: space }) };
    const parts = Object.entries(all).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }

  _body({ name, content, priority, compiled_code: compiledCode, description, shared, script_ids: scriptIds }) {
    const record = {};
    if (name !== undefined) record.name = name;
    if (content !== undefined) record.content = content;
    if (priority !== undefined) record.priority = priority;
    if (compiledCode !== undefined) record.compiled_code = compiledCode;
    // A project's fields (see projects.js).
    if (description !== undefined) record.description = description;
    if (shared !== undefined) record.shared = Boolean(shared);
    if (scriptIds !== undefined) record.script_ids = scriptIds;
    return { [this.key]: record };
  }

  async _request(method, path, body) {
    const url = `${this.baseUrl}/${this.resource}${path}`;
    let response;
    try {
      response = await this._fetch(url, {
        method,
        headers: { Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new StoreError(`Cannot reach the database server at ${this.baseUrl}`, { details: e });
    }
    if (response.status === 204) return null;
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!response.ok) {
      throw new StoreError(errorMessage(response.status, data), { status: response.status, details: data });
    }
    return data;
  }
}

/** What an e-mail address must look like (as on the server). */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

/**
 * Registers a user on the server (POST /users) and returns the new user,
 * { id, name, email, created_at }. email is optional. Fails with a
 * StoreError, e.g. "name has already been taken". It does not sign in: call
 * setUser() for that.
 * @param {{name: string, email?: string}} fields
 * @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options]
 */
export function registerUser({ name, email } = {}, { baseUrl = getServerUrl, fetch: fetchFn } = {}) {
  const user = { name: String(name ?? '').trim() };
  const address = String(email ?? '').trim();
  if (address) user.email = address;
  const store = new SourceStore({ resource: 'users', key: 'user', baseUrl, fetch: fetchFn });
  return store._request('POST', '', { user });
}

/**
 * Looks a user up on the server (GET /users/:name): the registered user,
 * { id, name }, with the name as registered, or null if nobody is registered
 * under it. Other failures (the server cannot be reached, say) are thrown as
 * StoreErrors.
 * @param {string} name
 * @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options]
 */
export async function findUser(name, { baseUrl = getServerUrl, fetch: fetchFn } = {}) {
  const store = new SourceStore({ resource: 'users', key: 'user', baseUrl, fetch: fetchFn });
  try {
    return await store._request('GET', `/${encodeURIComponent(String(name ?? '').trim())}`);
  } catch (e) {
    if (e instanceof StoreError && e.status === 404) return null;
    throw e;
  }
}

// Rails answers { errors: { name: ["can't be blank"] } } or { error: "..." }.
function errorMessage(status, data) {
  if (data?.errors && typeof data.errors === 'object') {
    const parts = Object.entries(data.errors)
      .flatMap(([field, msgs]) => [].concat(msgs).map((m) => `${field} ${m}`));
    if (parts.length) return parts.join('; ');
  }
  if (data?.error) return String(data.error);
  return `Server error ${status}`;
}
