// FileCopyWindow: the singleton window, opened by File > File Copy, that
// copies files between two places, in the manner of Norton Commander. It has
// two panes side by side, each showing a database; the active pane is the
// source and the other is the target.
//
// A pane shows one of (the pulldown, in this order):
//   <user>'s scripts            the signed-in user's scripts, as name.py
//   <user>'s projects           the user's projects (as My Projects shows
//                               them), a folder each, holding its scripts as
//                               name.py
//   Folder: <name>              a folder on this computer chosen earlier
//   Folder on this computer...  asks for a folder (showDirectoryPicker: Chrome,
//                               Edge and the desktop app; greyed out elsewhere)
// Scripts and projects are on the database in use (Settings > Database; in
// the desktop app, its own database), and follow a change of user or server.
// F7 in a projects pane makes a new (empty, unshared) project; F8 on a project
// deletes it with its scripts, after asking.
//
// In a browser, File > File Copy is shown only while the user "admin" is
// signed in (File > Sign In), and the window closes if the user changes. In
// the desktop app it is everyone's. It opens on the user's scripts and
// projects. It has no sign-in of its own: the database is reached with the
// token from File > Sign In (in the desktop app, File > FastBlips Account).
//
// Keys:  Tab           switch pane
//        Up Down Home End PgUp PgDn   move
//        Enter         open a folder (.. goes up; so does Backspace)
//        Insert, Space mark or unmark the file and move down
//        +  -  *       mark all, unmark all, invert the marks
//        Ctrl+A        mark all; Ctrl+Shift+A or Ctrl+D unmark all
//        Select All    the button does the same: it marks all, or unmarks all if all are marked
//        F5 Copy       the marked files, or the one under the cursor, to the other pane
//        F6 Move       the same, deleting each once copied
//        F7 New Folder in the active pane
//        F8, Delete    delete the marked files, after asking
//        F9            read both panes again
// Folders are copied with all they hold. A file that exists in the target is
// replaced only when asked: Overwrite, Skip, Overwrite All, Skip All or Cancel.
// Escape stops a copy in progress. The copy engine is in file-volumes.js.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import {
  currentUserVolumes, DirectoryVolume, canPickFolder, transfer, removeEntries, describeResult, formatSize,
} from '../file-volumes.js';
import { isAdmin, isDesktopApp } from '../db-client.js';

/** Whether File Copy is offered: to everyone in the desktop app, else to admin. */
export const canUseFileCopy = () => isDesktopApp() || isAdmin();

let instance = null;
const PICK_FOLDER = 'pick-folder';   // the pulldown item that asks for a folder

const STYLE = `
.cr-fc{position:absolute;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:4px;
  background:var(--cr-window-bg);color:var(--cr-text);font:13px/1.35 var(--cr-font-code,Consolas,monospace);overflow:hidden}
.cr-fc-panes{flex:1;display:flex;gap:4px;min-height:0}
.cr-fc-pane{flex:1;display:flex;flex-direction:column;min-width:0;box-sizing:border-box;border:3px double var(--cr-field-border)}
.cr-fc-pane.cr-fc-active{border-color:var(--cr-accent)}
.cr-fc-head{display:flex;flex-direction:column;gap:2px;padding:2px 4px}
.cr-fc-select{width:100%;box-sizing:border-box;font:inherit;background:var(--cr-input-bg);color:var(--cr-text);border:1px solid var(--cr-field-border)}
.cr-fc-path{color:var(--cr-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
.cr-fc-list{flex:1;overflow:auto;outline:0;min-height:0;border-top:1px solid var(--cr-divider);border-bottom:1px solid var(--cr-divider)}
.cr-fc-row{display:flex;padding:0 6px;white-space:pre;cursor:default}
.cr-fc-row span{overflow:hidden}
.cr-fc-n{flex:1;text-overflow:ellipsis}
.cr-fc-s{width:7ch;text-align:right;flex:none}
.cr-fc-d{width:15ch;text-align:right;flex:none;margin-left:1ch}
.cr-fc-row.cr-fc-dir .cr-fc-n{color:var(--cr-text);font-weight:bold}
.cr-fc-row.cr-fc-marked{color:var(--cr-accent);font-weight:bold}
.cr-fc-row.cr-fc-cursor{outline:1px dotted var(--cr-text-muted);outline-offset:-1px}
.cr-fc-active .cr-fc-row.cr-fc-cursor{background:var(--cr-list-selected-focus);color:var(--cr-list-selected-focus-text);outline:0}
.cr-fc-active .cr-fc-row.cr-fc-cursor.cr-fc-marked{color:var(--cr-list-selected-focus-text);text-decoration:underline}
.cr-fc-note{padding:4px 6px;color:var(--cr-text-muted)}
.cr-fc-foot{padding:1px 6px;white-space:pre;overflow:hidden;text-overflow:ellipsis}
.cr-fc-prompt{display:none;align-items:center;gap:6px;padding:3px 6px;background:var(--cr-header-bg);color:var(--cr-header-text)}
.cr-fc-prompt.cr-fc-show{display:flex}
.cr-fc-prompt-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-fc-prompt input{flex:1;min-width:6em;font:inherit;border:1px solid var(--cr-field-border);padding:0 3px;
  background:var(--cr-input-bg);color:var(--cr-text)}
.cr-fc-prompt button{font:inherit;padding:0 8px;border:1px solid var(--cr-field-border);
  border-radius:var(--cr-radius-button);background:var(--cr-button-bg);color:var(--cr-button-text);cursor:pointer}
.cr-fc-prompt button.cr-fc-default{background:var(--cr-accent);color:var(--cr-accent-text);font-weight:bold}
.cr-fc-status{min-height:1.4em;padding:0 6px;background:var(--cr-status-bg);color:var(--cr-text);
  border-top:1px solid var(--cr-status-border);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.cr-fc-status.cr-fc-error{background:var(--cr-danger);color:#fff}
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

  /** Whether there are entries and all are marked. */
  get allMarked() { return this.entries.length > 0 && this.entries.every((e) => this.marked.has(e.name)); }

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
      if (o.disabled) { option.disabled = true; option.title = o.title ?? ''; }
      return option;
    }));
    this.showChoice();
  }

  /** Puts the pulldown back on what the pane shows (after a cancelled choice). */
  showChoice() {
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
    if (this.owner.active === this) queueMicrotask(() => this.owner._selectLabel());
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
   * @param {{volumes?: object[]}} [options] - the volumes the panes can show
   *   (tests); currentUserVolumes() by default
   */
  constructor({ volumes } = {}) {
    if (instance) throw new Error('FileCopyWindow is a singleton; use FileCopyWindow.instance');
    super({ title: 'File Copy', x: 70, y: 60, width: 800, height: 460, minWidth: 520, minHeight: 300 });
    instance = this;
    this.element.classList.add('cr-file-copy-window');
    this.databases = volumes ?? currentUserVolumes();
    this.folders = [];   // DirectoryVolumes for the folders chosen so far
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
    this.selectButton = this.buttonBar.addButton('Select All', () => this.toggleMarks());

    this.panel.element.addEventListener('keydown', (e) => this._key(e));
    document.addEventListener('cr-userchange', () => this._userChanged());
    // Settings > Database switched server: the database panes read it instead.
    document.addEventListener('cr-dbserverchange', () => this._reloadDatabases());
    this._started = false;
    this._refreshOptions();
  }

  // ------------------------------------------------------------ opening

  /**
   * Opens the window; the first time, the left pane shows the user's scripts
   * and the right one their projects.
   */
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
    const find = (id) => this.databases.find((v) => v.id === id);
    const left = find('scripts') ?? this.databases[0];
    const right = find('projects') ?? this.databases[1] ?? left;
    await Promise.all([this.leftPane.load(left, []), this.rightPane.load(right, [])]);
  }

  /** The places a pane can show, in the order of the pulldown. */
  get volumes() { return [...this.databases, ...this.folders]; }

  _refreshOptions() {
    const options = this.volumes.map((v) => ({ id: v.id, label: v.label }));
    options.push(canPickFolder()
      ? { id: PICK_FOLDER, label: 'Folder on this computer...' }
      : { id: PICK_FOLDER, label: 'Folder on this computer...', disabled: true,
        title: 'This browser cannot open folders; use Chrome, Edge or the desktop app' });
    for (const pane of [this.leftPane, this.rightPane]) pane.setOptions(options);
  }

  /** A pane's choice of where to look. */
  async choose(pane, id) {
    this.activate(pane);
    if (id === PICK_FOLDER) { await this.pickFolder(pane); return; }
    const volume = this.volumes.find((v) => v.id === id) ?? null;
    if (volume) await pane.load(volume, []);
  }

  /**
   * Asks for a folder on this computer and shows it in the pane. A folder
   * chosen before is shown again rather than listed twice. Cancelling leaves
   * the pane as it was.
   */
  async pickFolder(pane) {
    let handle;
    try {
      handle = await globalThis.showDirectoryPicker({ id: 'fastblips-file-copy', mode: 'readwrite' });
    } catch (e) {
      pane.showChoice();
      if (e?.name !== 'AbortError') this.status(`Cannot open the folder: ${e?.message || e}`, true);
      return;
    }
    let volume = null;
    for (const v of this.folders) {
      if (await v.handle.isSameEntry?.(handle)) { volume = v; break; }
    }
    if (!volume) {
      this._folderCount = (this._folderCount ?? 0) + 1;
      volume = new DirectoryVolume(handle, { id: `folder-${this._folderCount}`, label: `Folder: ${handle.name}` });
      this.folders.push(volume);
      this._refreshOptions();
    }
    await pane.load(volume, []);
  }

  // The database panes read the database again from the top (a new server).
  _reloadDatabases() {
    for (const pane of [this.leftPane, this.rightPane]) {
      if (pane.volume && this.databases.includes(pane.volume)) pane.load(pane.volume, []);
    }
  }

  // A new user: the database panes show that user's space. In a browser,
  // unless admin is still signed in, the window closes (File Copy is admin's).
  _userChanged() {
    if (!canUseFileCopy() && this.isOpen) { this.close(); return; }
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

  /** Marks every file of the active pane, or unmarks them all if they are all marked already. */
  toggleMarks() {
    const pane = this.active;
    pane.markAll(!pane.allMarked);
    pane.list.focus();
    this._selectLabel();
  }

  /** The Select All button says what it will do to the active pane. */
  _selectLabel() {
    if (!this.selectButton) return;
    const label = this.active.allMarked ? 'Unselect All' : 'Select All';
    if (this.selectButton.label === label) return;
    this.selectButton.label = label;
    this.buttonBar.layout();
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (e.shiftKey) this.active.markAll(false); else this.active.markAll(true);
      return undefined;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      this.active.markAll(false);
      return undefined;
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
