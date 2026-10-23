// FileCopyWindow: the singleton window, opened by File > File Copy, that
// copies files between two places, in the manner of Norton Commander. It has
// two panes side by side, each showing a folder or a database; the active
// pane is the source and the other is the target.
//
// A pane shows one of:
//   a folder on this computer   (File System Access API: Chrome and Edge)
//   Browser files               the page's private file system (any browser)
//   a database                  the scripts of the signed-in user, or the
//                               shared ones, on the remote or the local server
//                               (shown as name.bas and name.py)
//
// Keys:  Tab           switch pane
//        Up Down Home End PgUp PgDn   move
//        Enter         open a folder (.. goes up; so does Backspace)
//        Insert, Space mark or unmark the file and move down
//        +  -  *       mark all, unmark all, invert the marks
//        F5 Copy       the marked files, or the one under the cursor, to the other pane
//        F6 Move       the same, deleting each once copied
//        F7 New Folder in the active pane
//        F8, Delete    delete the marked files, after asking
//        F2            sign in to the remote database, or out of it: the
//                      "my scripts" pane then shows that user's scripts
//        F9            read both panes again
// Folders are copied with all they hold. A file that exists in the target is
// replaced only when asked: Overwrite, Skip, Overwrite All, Skip All or Cancel.
// Escape stops a copy in progress. The copy engine is in file-volumes.js.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import {
  DirectoryVolume, databaseVolumes, canPickFolder, canUseBrowserFiles,
  transfer, removeEntries, describeResult, formatSize,
} from '../file-volumes.js';
import {
  userName, setUser, signIn, signOut, USER_NAME_PATTERN, REMOTE_SERVER_URL,
} from '../db-client.js';

let instance = null;

const STYLE = `
.cr-fc{position:absolute;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:4px;
  background:#000080;color:#55ffff;font:13px/1.35 var(--cr-font-code,Consolas,monospace);overflow:hidden}
.cr-fc-panes{flex:1;display:flex;gap:4px;min-height:0}
.cr-fc-pane{flex:1;display:flex;flex-direction:column;min-width:0;box-sizing:border-box;border:3px double #55ffff}
.cr-fc-pane.cr-fc-active{border-color:#fff}
.cr-fc-head{display:flex;flex-direction:column;gap:2px;padding:2px 4px}
.cr-fc-select{width:100%;box-sizing:border-box;font:inherit;background:#000080;color:#fff;border:1px solid #55ffff}
.cr-fc-path{color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
.cr-fc-list{flex:1;overflow:auto;outline:0;min-height:0;border-top:1px solid #55ffff;border-bottom:1px solid #55ffff}
.cr-fc-row{display:flex;padding:0 6px;white-space:pre;cursor:default}
.cr-fc-row span{overflow:hidden}
.cr-fc-n{flex:1;text-overflow:ellipsis}
.cr-fc-s{width:7ch;text-align:right;flex:none}
.cr-fc-d{width:15ch;text-align:right;flex:none;margin-left:1ch}
.cr-fc-row.cr-fc-dir .cr-fc-n{color:#fff;font-weight:bold}
.cr-fc-row.cr-fc-marked{color:#ffff55}
.cr-fc-row.cr-fc-cursor{outline:1px dotted #55ffff;outline-offset:-1px}
.cr-fc-active .cr-fc-row.cr-fc-cursor{background:#00aaaa;color:#000;outline:0}
.cr-fc-active .cr-fc-row.cr-fc-cursor.cr-fc-marked{color:#aa0000}
.cr-fc-note{padding:4px 6px;color:#ffff55}
.cr-fc-foot{padding:1px 6px;white-space:pre;overflow:hidden;text-overflow:ellipsis}
.cr-fc-prompt{display:none;align-items:center;gap:6px;padding:3px 6px;background:#aaaaaa;color:#000}
.cr-fc-prompt.cr-fc-show{display:flex}
.cr-fc-prompt-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-fc-prompt input{flex:1;min-width:6em;font:inherit;border:1px solid #000;padding:0 3px}
.cr-fc-prompt button{font:inherit;padding:0 8px;border:1px solid #000;background:#00aaaa;color:#000;cursor:pointer}
.cr-fc-prompt button.cr-fc-default{background:#fff;font-weight:bold}
.cr-fc-status{min-height:1.4em;padding:0 6px;background:#00aaaa;color:#000;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.cr-fc-status.cr-fc-error{background:#aa0000;color:#fff}
`;

function installStyle() {
  if (document.getElementById('cr-file-copy-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-file-copy-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const pad = (n) => String(n).padStart(2, '0');

/** A modification time as yy-mm-dd hh:mm in local time, or ''. */
export function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getFullYear() % 100)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const UP = { name: '..', dir: true, up: true, size: null, modified: null };
const PICK = '\u0000pick';

/** One side of the window: a volume and a folder in it, with a cursor and marks. */
class FilePane {
  constructor(owner, side) {
    this.owner = owner;
    this.side = side;
    this.volume = null;
    this.path = [];
    this.entries = [];
    this.rows = [];
    this.cursor = 0;
    this.marked = new Set();
    this.note = 'Choose where to look';
    this._seq = 0;

    this.element = document.createElement('div');
    this.element.className = 'cr-fc-pane';
    const head = document.createElement('div');
    head.className = 'cr-fc-head';
    this.select = document.createElement('select');
    this.select.className = 'cr-fc-select';
    this.select.setAttribute('aria-label', `${side} pane: where to look`);
    this.select.addEventListener('change', () => owner.choose(this, this.select.value));
    this.pathLabel = document.createElement('div');
    this.pathLabel.className = 'cr-fc-path';
    head.append(this.select, this.pathLabel);
    this.list = document.createElement('div');
    this.list.className = 'cr-fc-list';
    this.list.tabIndex = 0;
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', `${side} pane`);
    this.list.addEventListener('focus', () => owner.activate(this));
    this.list.addEventListener('mousedown', (e) => {
      owner.activate(this);
      const row = e.target.closest('.cr-fc-row');
      if (!row) return;
      this.cursor = Number(row.dataset.index);
      if (e.ctrlKey || e.metaKey) this.toggle(this.cursor);
      this.render();
    });
    this.list.addEventListener('dblclick', (e) => { if (e.target.closest('.cr-fc-row')) this.enter(); });
    this.foot = document.createElement('div');
    this.foot.className = 'cr-fc-foot';
    this.element.append(head, this.list, this.foot);
  }

  /** The text for the target of a copy: 'Browser files /a/b'. */
  get where() {
    return this.volume ? `${this.volume.label}${this.path.length ? ` /${this.path.join('/')}` : ''}` : 'nowhere';
  }

  get current() { return this.rows[this.cursor] ?? null; }

  /** The entries a command works on: the marked ones, else the one under the cursor. */
  targets() {
    if (this.marked.size) return this.entries.filter((e) => this.marked.has(e.name));
    const row = this.current;
    return row && !row.up ? [row] : [];
  }

  setOptions(options) {
    this.select.replaceChildren(...options.map((o) => {
      const option = document.createElement('option');
      option.value = o.id;
      option.textContent = o.label;
      return option;
    }));
    if (this.volume) this.select.value = this.volume.id;
  }

  /**
   * Shows a folder of a volume (the one it already shows by default), keeping
   * the cursor on `keep` if that is still there. If the folder cannot be read
   * and the pane already shows something, it goes on showing that, and the
   * error goes to the status line.
   * @returns {Promise<boolean>} whether it could be read
   */
  async load(volume = this.volume, path = this.path, keep = null) {
    const seq = ++this._seq;
    let entries = null;
    let failure = null;
    try { entries = await volume.list(path); } catch (e) { failure = e?.message || String(e); }
    if (seq !== this._seq) return false;   // a newer load took over
    if (failure !== null) {
      this.owner.status(`${volume.label}: ${failure}`, true);
      if (this.volume) { this.select.value = this.volume.id; return false; }
      entries = [];
      this.note = failure;
    } else {
      this.note = '';
    }
    const name = keep ?? this.current?.name;
    this.volume = volume;
    this.path = path;
    this.entries = entries;
    this.rows = path.length ? [UP, ...entries] : entries;
    const at = this.rows.findIndex((r) => r.name === name);
    this.cursor = at >= 0 ? at : Math.min(this.cursor, Math.max(0, this.rows.length - 1));
    const names = new Set(entries.map((e) => e.name));
    for (const m of [...this.marked]) if (!names.has(m)) this.marked.delete(m);
    this.select.value = volume.id;
    this.render();
    return failure === null;
  }

  reload(keep = null) { return this.volume ? this.load(this.volume, this.path, keep) : Promise.resolve(false); }

  enter() {
    const row = this.current;
    if (!row || !row.dir) return Promise.resolve(false);
    return row.up ? this.up() : this.load(this.volume, [...this.path, row.name]);
  }

  up() {
    if (!this.path.length) return Promise.resolve(false);
    return this.load(this.volume, this.path.slice(0, -1), this.path.at(-1));
  }

  move(delta) {
    if (!this.rows.length) return;
    this.cursor = Math.max(0, Math.min(this.rows.length - 1, this.cursor + delta));
    this.render();
  }

  toggle(index) {
    const row = this.rows[index];
    if (!row || row.up) return;
    if (!this.marked.delete(row.name)) this.marked.add(row.name);
  }

  markAll(on) {
    if (on) for (const e of this.entries) this.marked.add(e.name);
    else this.marked.clear();
    this.render();
  }

  invert() {
    for (const e of this.entries) if (!this.marked.delete(e.name)) this.marked.add(e.name);
    this.render();
  }

  render() {
    this.element.classList.toggle('cr-fc-active', this.owner.active === this);
    this.pathLabel.textContent = this.volume ? `/${this.path.join('/')}` : '';
    this.pathLabel.title = this.where;
    const rows = this.rows.map((entry, index) => {
      const div = document.createElement('div');
      div.className = 'cr-fc-row'
        + (entry.dir ? ' cr-fc-dir' : '')
        + (index === this.cursor ? ' cr-fc-cursor' : '')
        + (this.marked.has(entry.name) ? ' cr-fc-marked' : '');
      div.dataset.index = String(index);
      div.setAttribute('role', 'option');
      div.setAttribute('aria-selected', String(index === this.cursor));
      const name = document.createElement('span');
      name.className = 'cr-fc-n';
      name.textContent = (this.marked.has(entry.name) ? '● ' : '  ') + (entry.dir && !entry.up ? `${entry.name}/` : entry.name);
      const size = document.createElement('span');
      size.className = 'cr-fc-s';
      size.textContent = entry.up ? '' : entry.dir ? '<DIR>' : formatSize(entry.size);
      const when = document.createElement('span');
      when.className = 'cr-fc-d';
      when.textContent = formatTime(entry.modified);
      div.append(name, size, when);
      return div;
    });
    this.list.replaceChildren(...rows);
    if (!rows.length) {
      const note = document.createElement('div');
      note.className = 'cr-fc-note';
      note.textContent = this.note || (this.volume ? 'Nothing here' : 'Choose where to look');
      this.list.appendChild(note);
    }
    this.list.children[this.cursor]?.scrollIntoView?.({ block: 'nearest' });
    const files = this.entries.filter((e) => !e.dir);
    const bytes = files.reduce((n, e) => n + (e.size ?? 0), 0);
    const marked = this.entries.filter((e) => this.marked.has(e.name));
    const markedBytes = marked.reduce((n, e) => n + (e.size ?? 0), 0);
    this.foot.textContent = marked.length
      ? `${marked.length} marked, ${formatSize(markedBytes)}`
      : `${files.length} file${files.length === 1 ? '' : 's'}, ${formatSize(bytes)}`
        + `${this.entries.length > files.length ? `, ${this.entries.length - files.length} folder${this.entries.length - files.length === 1 ? '' : 's'}` : ''}`;
  }
}

/** The content of the window: two panes, a question line and a status line. */
class FileCopyPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-fc');
    this.panes = document.createElement('div');
    this.panes.className = 'cr-fc-panes';
    this.prompt = document.createElement('div');
    this.prompt.className = 'cr-fc-prompt';
    this.prompt.setAttribute('role', 'alertdialog');
    this.statusLine = document.createElement('div');
    this.statusLine.className = 'cr-fc-status';
    this.statusLine.setAttribute('role', 'status');
    this.element.append(this.panes, this.prompt, this.statusLine);
  }
}

export class FileCopyWindow extends Window {
  /** The single FileCopyWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new FileCopyWindow();
    return instance;
  }

  /**
   * @param {{volumes?: object[], pickFolder?: () => Promise<object|null>, browserFiles?: () => Promise<object|null>, signIn?: (credentials: {name: string, password: string}) => Promise<object|null>}} [options] -
   *   the database volumes, how a folder is picked, how the browser's private
   *   file system is opened, and how a user is signed in on the remote server
   *   (tests); the real ones by default
   */
  constructor({ volumes, pickFolder, browserFiles, signIn: signInCall } = {}) {
    if (instance) throw new Error('FileCopyWindow is a singleton; use FileCopyWindow.instance');
    super({ title: 'File Copy', x: 70, y: 60, width: 800, height: 460, minWidth: 520, minHeight: 300 });
    instance = this;
    this.element.classList.add('cr-file-copy-window');
    this.databases = volumes ?? databaseVolumes();
    this.folders = [];   // folders picked on this computer, in the order they were picked
    this._pick = pickFolder ?? (() => pickRealFolder());
    this._canPick = pickFolder ? true : canPickFolder();
    this._browserFiles = browserFiles ?? (() => openBrowserFiles());
    this._signIn = signInCall ?? ((credentials) => signIn(credentials, { baseUrl: REMOTE_SERVER_URL }));
    this.browser = null;   // the Browser files volume, once opened
    this.busy = false;
    this.stopRequested = false;
    this._asking = null;   // the question being asked, if any

    this.panel = new FileCopyPanel();
    this.content = this.panel;
    this.leftPane = new FilePane(this, 'Left');
    this.rightPane = new FilePane(this, 'Right');
    this.panel.panes.append(this.leftPane.element, this.rightPane.element);
    this.active = this.leftPane;

    this.copyButton = this.buttonBar.addButton('F5 Copy', () => this.copy(false));
    this.moveButton = this.buttonBar.addButton('F6 Move', () => this.copy(true));
    this.folderButton = this.buttonBar.addButton('F7 New Folder', () => this.makeFolder());
    this.deleteButton = this.buttonBar.addButton('F8 Delete', () => this.deleteSelected());
    this.buttonBar.addButton('F9 Refresh', () => this.refresh());
    this.loginButton = this.buttonBar.addButton('F2 Sign In', () => this.toggleLogin());
    this._loginLabel();

    this.panel.element.addEventListener('keydown', (e) => this._key(e));
    document.addEventListener('cr-userchange', () => this._userChanged());
    this._started = false;
    this._refreshOptions();
  }

  // ------------------------------------------------------------ opening

  /** Opens the window; the first time, the left pane shows the signed-in user's scripts on the remote server and the right one a folder (Browser files). */
  open(viewport) {
    super.open(viewport);
    if (!this._started) {
      this._started = true;
      this.start();
    } else {
      this.refresh();
    }
    this.active.list.focus();
    return this;
  }

  async start() {
    const first = this.databases[0];
    const second = canUseBrowserFiles() ? await this._openBrowserFiles() : this.databases[2] ?? this.databases[0];
    await Promise.all([this.leftPane.load(first, []), this.rightPane.load(second ?? first, [])]);
  }

  async _openBrowserFiles() {
    if (!this.browser) {
      try { this.browser = await this._browserFiles(); } catch (e) { this.status(`Browser files: ${e.message}`, true); }
    }
    this._refreshOptions();
    return this.browser;
  }

  /** The places a pane can show: [{ id, label }], and the volume behind each id. */
  get volumes() {
    return [...this.databases, ...(this.browser ? [this.browser] : []), ...this.folders];
  }

  _refreshOptions() {
    const options = this.volumes.map((v) => ({ id: v.id, label: v.label }));
    if (!this.browser && canUseBrowserFiles()) options.push({ id: 'browser', label: 'Browser files (private to this page)' });
    if (this._canPick) {
      options.push({ id: PICK, label: 'Folder on this computer...' });
    }
    for (const pane of [this.leftPane, this.rightPane]) pane.setOptions(options);
  }

  /** A pane's choice of where to look. */
  async choose(pane, id) {
    this.activate(pane);
    let volume = this.volumes.find((v) => v.id === id) ?? null;
    if (id === PICK) {
      let picked = null;
      try { picked = await this._pick(); } catch (e) {
        if (e?.name !== 'AbortError') this.status(`Could not open the folder: ${e?.message ?? e}`, true);
      }
      if (!picked) { if (pane.volume) pane.select.value = pane.volume.id; return; }
      const taken = this.folders.map((f) => f.id);
      if (taken.includes(picked.id)) picked.id = `${picked.id}#${taken.length}`;
      this.folders.push(picked);
      volume = picked;
      this._refreshOptions();
    } else if (id === 'browser') {
      volume = await this._openBrowserFiles();
    }
    if (volume) await pane.load(volume, []);
  }

  /** The Sign In / Sign Out button says which it will do, and for whom. */
  _loginLabel() {
    const user = userName();
    this.loginButton.label = user ? `F2 Sign Out (${user})` : 'F2 Sign In';
    this.buttonBar.layout();
  }

  /** Signs out if a user is signed in, else asks for a user name to sign in with. */
  toggleLogin() {
    return userName() ? this.signOut() : this.signIn();
  }

  /** Signs out of the remote database: the "my scripts" pane goes back to the shared scripts. */
  signOut() {
    if (this.busy) { this.status('Wait until the current job is done (Escape stops it)', true); return false; }
    const was = userName();
    signOut({ baseUrl: REMOTE_SERVER_URL });   // the server forgets the token
    setUser('');
    this.status(`Signed out ${was}: working in the shared space`);
    return true;
  }

  /**
   * Asks for a user name and password and signs in with them on the remote server,
   * which answers with the token that lets the user change their scripts.
   * @returns {Promise<boolean>} true if signed in
   */
  async signIn() {
    if (this.busy) { this.status('Wait until the current job is done (Escape stops it)', true); return false; }
    const answer = await this.ask({
      message: 'Sign in to the remote database. User name:', input: userName(),
      buttons: [{ label: 'Sign In', value: 'yes' }, { label: 'Cancel', value: 'no' }],
    });
    if (!answer || answer.value !== 'yes') { this.status('Cancelled'); return false; }
    const name = answer.text.trim();
    if (!USER_NAME_PATTERN.test(name)) {
      this.status('A user name is 2 to 30 letters, digits, - or _', true);
      return false;
    }
    const secret = await this.ask({
      message: `Password for ${name}:`, input: '', secret: true,
      buttons: [{ label: 'Sign In', value: 'yes' }, { label: 'Cancel', value: 'no' }],
    });
    if (!secret || secret.value !== 'yes') { this.status('Cancelled'); return false; }
    this.busy = true;
    this.status('Signing in...');
    let user;
    try {
      user = await this._signIn({ name, password: secret.text });
    } catch (e) {
      this.busy = false;
      this.status(`Could not sign in: ${e?.message || e}`, true);
      return false;
    }
    this.busy = false;
    if (!user) {
      this.status(`Could not sign in as ${name}`, true);
      return false;
    }
    const signedInAs = user.name ?? name;
    setUser(signedInAs);   // the panes showing a database read again (see _userChanged)
    this.status(`Signed in as ${signedInAs}`);
    return true;
  }

  _userChanged() {
    this._loginLabel();
    for (const pane of [this.leftPane, this.rightPane]) {
      if (pane.volume && this.databases.includes(pane.volume)) pane.load(pane.volume, []);
    }
    this._refreshOptions();
  }

  get other() { return this.active === this.leftPane ? this.rightPane : this.leftPane; }

  activate(pane) {
    if (this.active === pane && pane.element.classList.contains('cr-fc-active')) return;
    this.active = pane;
    this.leftPane.render();
    this.rightPane.render();
  }

  status(text, error = false) {
    this.panel.statusLine.textContent = text;
    this.panel.statusLine.classList.toggle('cr-fc-error', Boolean(error));
  }

  /** Reads both panes again. */
  refresh() { return Promise.all([this.leftPane.reload(), this.rightPane.reload()]); }

  // ------------------------------------------------------------ questions

  /**
   * Asks a question on the line above the status line and waits for the
   * answer: the value of the button chosen (Enter chooses the first), or the
   * text typed if there is a field, or null for Escape.
   * @param {{message: string, buttons?: {label: string, value: string}[], input?: string, secret?: boolean}} question
   */
  ask({ message, buttons = [], input, secret = false }) {
    const bar = this.panel.prompt;
    return new Promise((resolve) => {
      const text = document.createElement('span');
      text.className = 'cr-fc-prompt-text';
      text.textContent = message;
      text.title = message;
      const parts = [text];
      let field = null;
      if (input !== undefined) {
        field = document.createElement('input');
        field.value = input;
        if (secret) { field.type = 'password'; field.autocomplete = 'current-password'; }
        field.spellcheck = false;
        field.setAttribute('aria-label', message);
        parts.push(field);
      }
      const finish = (value) => {
        bar.classList.remove('cr-fc-show');
        bar.onkeydown = null;
        bar.replaceChildren();
        this._asking = null;
        resolve(value);
        this.active.list.focus();
      };
      this._asking = { cancel: () => finish(null) };
      buttons.forEach((b, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = b.label;
        if (i === 0) button.className = 'cr-fc-default';
        button.addEventListener('click', () => finish(field ? { value: b.value, text: field.value } : b.value));
        parts.push(button);
      });
      bar.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        else if (e.key === 'Enter' && (field || e.target === bar)) {
          e.preventDefault();
          finish(field ? { value: buttons[0]?.value, text: field.value } : buttons[0]?.value ?? null);
        }
      };
      bar.replaceChildren(...parts);
      bar.classList.add('cr-fc-show');
      this._lastAsk = { buttons: parts.filter((p) => p.tagName === 'BUTTON'), field };
      (field ?? this._lastAsk.buttons[0])?.focus();
      if (field) field.select();
    });
  }

  // ------------------------------------------------------------ keys

  _key(e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
      if (e.key === 'Escape' && this._asking) { e.preventDefault(); this._asking.cancel(); }
      return;
    }
    const pane = this.active;
    const page = Math.max(1, Math.floor(pane.list.clientHeight / 18) - 1);
    const handled = (fn) => { e.preventDefault(); fn(); };
    switch (e.key) {
      case 'Tab': return handled(() => { const next = this.other; next.list.focus(); this.activate(next); });
      case 'ArrowDown': return handled(() => pane.move(1));
      case 'ArrowUp': return handled(() => pane.move(-1));
      case 'PageDown': return handled(() => pane.move(page));
      case 'PageUp': return handled(() => pane.move(-page));
      case 'Home': return handled(() => { pane.cursor = 0; pane.render(); });
      case 'End': return handled(() => { pane.cursor = Math.max(0, pane.rows.length - 1); pane.render(); });
      case 'Enter': return handled(() => pane.enter());
      case 'Backspace': return handled(() => pane.up());
      case 'Insert':
      case ' ': return handled(() => { pane.toggle(pane.cursor); pane.move(1); pane.render(); });
      case '+': return handled(() => pane.markAll(true));
      case '-': return handled(() => pane.markAll(false));
      case '*': return handled(() => pane.invert());
      case 'F2': return handled(() => this.toggleLogin());
      case 'F5': return handled(() => this.copy(false));
      case 'F6': return handled(() => this.copy(true));
      case 'F7': return handled(() => this.makeFolder());
      case 'F8':
      case 'Delete': return handled(() => this.deleteSelected());
      case 'F9': return handled(() => this.refresh());
      case 'Escape':
        if (this.busy) { this.stopRequested = true; this.status('Stopping...'); e.preventDefault(); }
        return undefined;
      default: return undefined;
    }
  }

  // ------------------------------------------------------------ commands

  _ready(pane = this.active) {
    if (this.busy) { this.status('Wait until the current job is done (Escape stops it)', true); return false; }
    if (!pane.volume) { this.status('Choose where to look first', true); return false; }
    return true;
  }

  static _described(entries) {
    return entries.length === 1 ? `"${entries[0].name}"` : `${entries.length} items`;
  }

  /**
   * Copies (or moves) the marked entries, or the one under the cursor, of the
   * active pane into the folder the other pane shows.
   * @returns {Promise<object|null>} the result of the transfer, or null if nothing was done
   */
  async copy(move) {
    const from = this.active;
    const to = this.other;
    if (!this._ready(from)) return null;
    if (!to.volume) { this.status('Choose where to copy to in the other pane', true); return null; }
    const entries = from.targets();
    if (!entries.length) { this.status('Nothing to copy: put the cursor on a file, or mark files with Insert', true); return null; }
    const verb = move ? 'Move' : 'Copy';
    const answer = await this.ask({
      message: `${verb} ${FileCopyWindow._described(entries)} to ${to.where}?`,
      buttons: [{ label: verb, value: 'yes' }, { label: 'Cancel', value: 'no' }],
    });
    if (answer !== 'yes') { this.status('Cancelled'); return null; }
    this.busy = true;
    this.stopRequested = false;
    let result;
    try {
      result = await transfer({
        from: from.volume, fromPath: from.path, entries, to: to.volume, toPath: to.path, move,
        ask: (name) => this._overwrite(name),
        progress: (name) => this.status(`${move ? 'Moving' : 'Copying'} ${name}...`),
        stop: () => this.stopRequested,
      });
    } catch (e) {
      this.busy = false;
      this.status(e?.message || String(e), true);
      return null;
    }
    this.busy = false;
    from.marked.clear();
    this.status(describeResult(move ? 'Moved' : 'Copied', result), result.failed.length > 0);
    await this.refresh();
    return result;
  }

  async _overwrite(name) {
    const answer = await this.ask({
      message: `"${name}" already exists. Overwrite it?`,
      buttons: [
        { label: 'Overwrite', value: 'overwrite' }, { label: 'Skip', value: 'skip' },
        { label: 'Overwrite All', value: 'overwrite-all' }, { label: 'Skip All', value: 'skip-all' },
        { label: 'Cancel', value: 'cancel' },
      ],
    });
    return answer ?? 'cancel';
  }

  /** Deletes the marked entries, or the one under the cursor, of the active pane, after asking. */
  async deleteSelected() {
    const pane = this.active;
    if (!this._ready(pane)) return null;
    const entries = pane.targets();
    if (!entries.length) { this.status('Nothing to delete: put the cursor on a file, or mark files with Insert', true); return null; }
    const folders = entries.some((e) => e.dir) ? ' (folders with everything in them)' : '';
    const answer = await this.ask({
      message: `Delete ${FileCopyWindow._described(entries)} from ${pane.where}${folders}? This cannot be undone.`,
      buttons: [{ label: 'Delete', value: 'yes' }, { label: 'Cancel', value: 'no' }],
    });
    if (answer !== 'yes') { this.status('Cancelled'); return null; }
    this.busy = true;
    const result = await removeEntries(pane.volume, pane.path, entries);
    this.busy = false;
    pane.marked.clear();
    this.status(describeResult('Deleted', result), result.failed.length > 0);
    await this.refresh();
    return result;
  }

  /** Asks for a name and makes a folder with it in the active pane. */
  async makeFolder() {
    const pane = this.active;
    if (!this._ready(pane)) return null;
    if (!pane.volume.folders) { this.status('A database has no folders', true); return null; }
    const answer = await this.ask({
      message: 'New folder:', input: '', buttons: [{ label: 'Make', value: 'yes' }, { label: 'Cancel', value: 'no' }],
    });
    if (!answer || answer.value !== 'yes') return null;
    const name = answer.text.trim();
    if (!name || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) {
      this.status('A folder name cannot be empty or hold any of \\ / : * ? " < > |', true);
      return null;
    }
    if (pane.entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      this.status(`"${name}" already exists`, true);
      return null;
    }
    try {
      await pane.volume.mkdir(pane.path, name);
    } catch (e) {
      this.status(`Could not make the folder: ${e?.message || e}`, true);
      return null;
    }
    this.status(`Made the folder ${name}`);
    await pane.reload(name);
    return name;
  }
}

// ---------------------------------------------------------------- real folders

async function pickRealFolder() {
  const handle = await globalThis.showDirectoryPicker({ mode: 'readwrite' });
  if (handle.requestPermission) await handle.requestPermission({ mode: 'readwrite' });
  return new DirectoryVolume(handle, { id: `dir:${handle.name}`, label: `Folder: ${handle.name}` });
}

async function openBrowserFiles() {
  return new DirectoryVolume(await globalThis.navigator.storage.getDirectory(),
    { id: 'browser', label: 'Browser files (private to this page)' });
}
