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

/** The deployed server (Heroku, at api.fastblips.com): the default. */
export const REMOTE_SERVER_URL = 'https://api.fastblips.com';

/** A server running on this machine, chosen with ?db=local. */
export const LOCAL_SERVER_URL = 'http://localhost:3000';

/**
 * The desktop app's own database (electron/src/db): a SQLite file on this
 * computer, answered by the app's main process at this address with the same
 * routes as the Rails server. Only there in the desktop app.
 */
export const DESKTOP_SERVER_URL = 'fbdb://local';

/** True in the desktop (Electron) app, where the Desktop database exists. */
export function isDesktopApp() {
  return globalThis.fastblipsDesktop?.isDesktop === true;
}

/**
 * The tables the Views menu offers: the scripts table, one language each.
 * (Each language had a table of its own before the server merged them.)
 */
export const TABLES = {
  python: { resource: 'scripts', key: 'script', language: 'python', title: 'Python', owner: spaceName },
};

/**
 * The servers Settings > Database offers: [name, label, url]. Desktop comes
 * first, and only in the desktop app.
 */
export function serverChoices() {
  return [
    ...(isDesktopApp() ? [['desktop', 'Desktop (this computer)', DESKTOP_SERVER_URL]] : []),
    ['remote', 'Remote', REMOTE_SERVER_URL],
    ['local', 'Local', LOCAL_SERVER_URL],
  ];
}

/** The servers offered when this page loaded (serverChoices() is always current). */
export const SERVERS = serverChoices();

const SERVER_URLS = { desktop: DESKTOP_SERVER_URL, remote: REMOTE_SERVER_URL, local: LOCAL_SERVER_URL };
const knownServer = (name) => serverChoices().some(([n]) => n === name);
const STORAGE_KEY = 'crumb.dbServer';
let chosen = null;   // set by setServer() on this page

/**
 * The server in use, 'desktop', 'remote' or 'local': the one chosen in
 * Settings on this page, else a db= query parameter, else the choice
 * remembered from an earlier visit, else 'desktop' in the desktop app and
 * 'remote' elsewhere.
 */
export function serverName() {
  if (chosen && knownServer(chosen)) return chosen;
  try {
    const asked = new URLSearchParams(globalThis.location.search).get('db')?.trim().toLowerCase();
    if (asked && knownServer(asked)) return asked;
  } catch { /* no location */ }
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved && knownServer(saved)) return saved;
  } catch { /* storage blocked */ }
  return isDesktopApp() ? 'desktop' : 'remote';
}

/** The URL of the server in use. */
export function getServerUrl() {
  return SERVER_URLS[serverName()];
}

/** True when the server in use is the desktop app's own database. */
export function isDesktopServer() {
  return serverName() === 'desktop';
}

/**
 * The server for what lives only on a Rails server - the forum, and user
 * accounts: the one in use, except that Desktop uses the remote server.
 */
export function accountServerUrl() {
  return isDesktopServer() ? REMOTE_SERVER_URL : getServerUrl();
}

/**
 * Switches to the 'remote' or 'local' server, remembers the choice for the
 * next visit and announces it with a cr-dbserverchange event on document.
 */
export function setServer(name) {
  if (!knownServer(name)) throw new Error(`unknown database server '${name}'`);
  chosen = name;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, name); } catch { /* not remembered */ }
  globalThis.document?.dispatchEvent(new CustomEvent('cr-dbserverchange',
    { detail: { name, url: getServerUrl() } }));
}

/** What a user name may be: 2 to 30 letters, digits, - or _ (as on the server). */
export const USER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,29}$/i;
// Every session starts signed out: the user and the sign-in tokens live only
// in this page, never in storage. Earlier builds remembered them in
// localStorage under these keys; whatever is left there is cleared on load.
const LEGACY_SIGN_IN_KEYS = ['crumb.user', 'crumb.tokens'];
try {
  for (const key of LEGACY_SIGN_IN_KEYS) globalThis.localStorage?.removeItem(key);
} catch { /* storage blocked */ }

let user = '';          // set by setUser() on this page
let signedInName = '';  // the user signIn() last signed in with a password on this page

/** The user who may use File > File Copy. */
export const ADMIN_USER = 'admin';
let pageSpace = null;   // set by setSpace() on this page

/**
 * The user this browser works as, or '' for none. Chosen on this page only:
 * a new session (page load) starts signed out. There is a name; the token
 * that proves it is kept by signIn().
 */
export function userName() {
  return user;
}

/**
 * Switches user ('' for none) for this session and announces it with a
 * cr-userchange event on document.
 */
/**
 * True when the user "admin" (ADMIN_USER, ignoring case) is signed in on this
 * page: signIn() succeeded for admin and admin is still the current user. Just
 * typing the name (Settings > User) is not enough; switching to another name
 * or signing out ends it.
 */
export function isAdmin() {
  return user.toLowerCase() === ADMIN_USER && signedInName.toLowerCase() === ADMIN_USER;
}

export function setUser(name) {
  name = String(name ?? '').trim();
  if (name && !USER_NAME_PATTERN.test(name)) {
    throw new Error('a user name is 2 to 30 letters, digits, - or _, starting with a letter or digit');
  }
  user = name;
  if (!name) signedInName = '';
  globalThis.document?.dispatchEvent(new CustomEvent('cr-userchange', { detail: { name } }));
}

/**
 * The space this page reads and saves in: the user's, or '' for the shared
 * one. A ?app= page sets it to the space of the app it runs (setSpace), so
 * the screens the app loads by name are its owner's, whoever is looking.
 */
export function spaceName() { return pageSpace ?? userName(); }

/** Fixes this page's space to owner's ('' for shared); null follows the user again. */
export function setSpace(owner) { pageSpace = owner == null ? null : String(owner).trim(); }

function trimUrl(url) { return String(url).trim().replace(/\/+$/, ''); }

// Sign-in tokens, one per server (a token from one server means nothing to
// another), kept for this page only: a new session starts with none.
const tokens = new Map();   // server URL -> token, for this page

/** The sign-in token for a server (the one in use by default), or '' for none. */
export function getToken(baseUrl = getServerUrl()) {
  return tokens.get(trimUrl(typeof baseUrl === 'function' ? baseUrl() : baseUrl)) ?? '';
}

/** Remembers the token for a server, or forgets it if token is empty. */
export function setToken(token, baseUrl = getServerUrl()) {
  const url = trimUrl(typeof baseUrl === 'function' ? baseUrl() : baseUrl);
  if (token) tokens.set(url, String(token)); else tokens.delete(url);
}

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

  _body({ name, content, language, priority, category, compiled_code: compiledCode, description, shared, scripts }) {
    const record = {};
    if (name !== undefined) record.name = name;
    if (content !== undefined) record.content = content;
    if (language !== undefined) record.language = language;
    if (priority !== undefined) record.priority = priority;
    if (category !== undefined) record.category = category;
    if (compiledCode !== undefined) record.compiled_code = compiledCode;
    // A project's fields (see projects.js).
    if (description !== undefined) record.description = description;
    if (shared !== undefined) record.shared = Boolean(shared);
    if (scripts !== undefined) record.scripts = scripts;
    return { [this.key]: record };
  }

  async _request(method, path, body) {
    const url = `${this.baseUrl}/${this.resource}${path}`;
    const token = getToken(this.baseUrl);
    let response;
    try {
      response = await this._fetch(url, {
        method,
        headers: { Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      if (response.status === 401 && !this.noSignInHint) {
        // A token the server no longer accepts is dropped, so the next sign-in starts clean.
        if (token) setToken('', this.baseUrl);
        // With the desktop database in use, File > Sign In is the desktop's;
        // the remote server's sign-in is File > FastBlips Account.
        const where = isDesktopServer() && this.baseUrl !== DESKTOP_SERVER_URL
          ? 'File > FastBlips Account' : 'File > Sign In';
        throw new StoreError(token
          ? `Your sign-in has expired: sign in again (${where})`
          : `Sign in first (${where}) to change the remote database`,
        { status: 401, details: data });
      }
      throw new StoreError(errorMessage(response.status, data), { status: response.status, details: data });
    }
    return data;
  }
}

/** What an e-mail address must look like (as on the server). */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

/** What a password must be (as on the server): 8 to 72 characters. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Why a password is not acceptable, or null if it is. */
export function passwordProblem(password) {
  const n = String(password ?? '').length;
  return n >= PASSWORD_MIN && n <= PASSWORD_MAX ? null : `A password is ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`;
}

/**
 * Registers a user on the server (POST /users) and returns the new user,
 * { id, name, email, created_at }. email is optional. The token the server
 * answers with is kept, so the new user is signed in to that server. Fails
 * with a StoreError, e.g. "name has already been taken".
 * @param {{name: string, password: string, email?: string}} fields
 * @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options]
 */
export async function registerUser({ name, password, email } = {}, { baseUrl = getServerUrl, fetch: fetchFn } = {}) {
  const user = { name: String(name ?? '').trim(), password: String(password ?? '') };
  const address = String(email ?? '').trim();
  if (address) user.email = address;
  const store = new SourceStore({ resource: 'users', key: 'user', baseUrl, fetch: fetchFn });
  store.noSignInHint = true;
  const created = await store._request('POST', '', { user });
  if (created?.token) {
    setToken(created.token, store.baseUrl);
    signedInName = String(created.name ?? user.name);   // registering signs the new user in
  }
  return created;
}

/**
 * Signs in on the server (POST /session) and keeps the token it answers with.
 * Returns the user, { id, name, admin }. A wrong name or password is a
 * StoreError with status 401.
 * @param {{name: string, password: string}} credentials
 * @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options]
 */
export async function signIn({ name, password } = {}, { baseUrl = getServerUrl, fetch: fetchFn } = {}) {
  const store = new SourceStore({ resource: 'session', key: 'session', baseUrl, fetch: fetchFn });
  store.noSignInHint = true;
  const session = { name: String(name ?? '').trim(), password: String(password ?? '') };
  const answer = await store._request('POST', '', { session });
  setToken(answer.token, store.baseUrl);
  signedInName = String(answer.user?.name ?? session.name);
  return answer.user;
}

/**
 * The user the server says this browser is signed in as (GET /session):
 * { id, name, admin, has_database_write_permission }, or null when nobody is
 * signed in, the token has expired or the server cannot be reached.
 * @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options]
 */
export async function sessionUser({ baseUrl = getServerUrl, fetch: fetchFn } = {}) {
  const store = new SourceStore({ resource: 'session', key: 'session', baseUrl, fetch: fetchFn });
  store.noSignInHint = true;
  try {
    return (await store._request('GET', ''))?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether this user may save records in the Database windows: only when the
 * server says has_database_write_permission is true (see the users table).
 */
export function canWriteDatabase(user) {
  return user?.has_database_write_permission === true;
}

/**
 * Signs out on the server (DELETE /session) and forgets the token. The token
 * is forgotten even if the server cannot be reached.
 * @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options]
 */
export async function signOut({ baseUrl = getServerUrl, fetch: fetchFn } = {}) {
  const store = new SourceStore({ resource: 'session', key: 'session', baseUrl, fetch: fetchFn });
  store.noSignInHint = true;
  try {
    if (getToken(store.baseUrl)) await store._request('DELETE', '');
  } catch { /* already signed out, or no server: the token goes either way */ }
  setToken('', store.baseUrl);
  signedInName = '';
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
