// SourceStore: a small client for the Rails API in rails/server, which
// exposes JSON CRUD for its tables. Programs are in one table, apps, whatever
// their language; a store given a language reads and makes only the apps in
// that language (the server's ?language= filter).
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
 * The tables the Database menu offers: the apps table, one language each.
 * (Each language had a table of its own before the server merged them.)
 */
export const TABLES = {
  basic: { resource: 'apps', key: 'app', language: 'basic', title: 'Basic' },
  python: { resource: 'apps', key: 'app', language: 'python', title: 'Python' },
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
   *          baseUrl?: string|(() => string), fetch?: typeof fetch}} options -
   *   language limits the store to the records in that language, and is set
   *   on the records it creates. baseUrl may be a function, so a changed
   *   server URL is picked up by stores that already exist.
   */
  constructor({ resource, key, language, baseUrl = getServerUrl, fetch: fetchFn } = {}) {
    if (!resource || !key) throw new TypeError('SourceStore needs a resource and a key');
    this.resource = resource;
    this.key = key;
    this.language = language ?? null;
    this._baseUrl = baseUrl;
    this._fetch = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  get baseUrl() {
    return trimUrl(typeof this._baseUrl === 'function' ? this._baseUrl() : this._baseUrl);
  }

  /** Every record (in the store's language, if it has one), ordered by id. */
  list() { return this._request('GET', this._query({})); }

  /** The records called name (the server's ?name= filter). */
  findByName(name) { return this._request('GET', this._query({ name })); }

  /** The record with this id. */
  get(id) { return this._request('GET', `/${encodeURIComponent(id)}`); }

  /** Creates a record from { name, content } and returns it (with its id). */
  create(fields) {
    const body = this._body(fields);
    if (this.language) body[this.key].language = this.language;
    return this._request('POST', '', body);
  }

  /** Updates the given fields of a record and returns the record. */
  update(id, fields) { return this._request('PATCH', `/${encodeURIComponent(id)}`, this._body(fields)); }

  /** Deletes a record. */
  async remove(id) { await this._request('DELETE', `/${encodeURIComponent(id)}`); }

  // "?name=...&language=...", or "" with neither.
  _query(filters) {
    const all = { ...filters, ...(this.language ? { language: this.language } : {}) };
    const parts = Object.entries(all).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }

  _body({ name, content, priority, compiled_code: compiledCode }) {
    const record = {};
    if (name !== undefined) record.name = name;
    if (content !== undefined) record.content = content;
    if (priority !== undefined) record.priority = priority;
    if (compiledCode !== undefined) record.compiled_code = compiledCode;
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
