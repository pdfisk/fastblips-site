// DatabaseWindow: a browser for one table of source records on the database
// server (rails/server) - the records listed on the left, the selected one
// edited on the right. Records can be created, viewed, edited and deleted.
// Save sits to the right of New and is always shown, but is enabled only for
// a selected record (or a new one) whose text has changed, and only for a user
// whose has_database_write_permission is true. Delete is enabled only while a
// record is selected. Compile (which saves) is shown only to a user who may
// write; others can browse and open records.
// Select, before New, limits the list to one category (Any shows them all);
// Category sets the selected record's category, saved with it; the title
// shows it ("Python Database: Tutorial").
// Several records can be selected at once (Ctrl/Cmd+click, Shift+click,
// Ctrl/Cmd+A): the editor is then empty, and a category chosen is given to
// all of them by Save. Refresh reloads the list and clears the selection and
// the editor.
// PythonDatabaseWindow chooses the table; there is one such window, opened
// from the Views menu.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { RecordPanel } from '../widgets/record-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { Menu } from '../widgets/menu.js';
import { SourceStore, TABLES, sessionUser, canWriteDatabase } from '../db-client.js';
import { PythonConsoleWindow } from './python-console-window.js';
import { chunkToJsonString, sourceHash } from '../../vm/chunk-json.js';

const instances = new Map();   // one window per subclass
const DEFAULT_PRIORITY = 3;

/**
 * A script's categories: the value stored on the server, and its label.
 * 'game' is a mobile game (tap or click): it was the only kind of game when
 * categories began, so existing games keep that value.
 */
export const CATEGORIES = [
  { value: 'game', label: 'Mobile Game' },
  { value: 'desktop-game', label: 'Desktop Game' },
  { value: 'getting-started', label: 'Getting Started' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'widget', label: 'Widget' },
];
const DEFAULT_CATEGORY = 'game';
const categoryOf = (record) => record?.category ?? DEFAULT_CATEGORY;

export class DatabaseWindow extends HSplitWindow {
  /** The table: a key of TABLES in db-client.js. Subclasses override. */
  static get table() { throw new Error('DatabaseWindow subclasses must define table'); }
  /** Monaco language for the content. Subclasses override. */
  static get language() { return 'plaintext'; }
  /** The console a record opens in. Subclasses override. */
  static get consoleClass() { return null; }

  /** The single window for this table, created on first use. */
  static get instance() {
    if (!instances.has(this)) instances.set(this, new this());
    return instances.get(this);
  }

  constructor({ store, session = sessionUser, ...options } = {}) {
    const cls = new.target;
    const table = TABLES[cls.table];
    const offset = instances.size * 24;
    super({
      title: `${table.title} Database`,
      x: 120 + offset, y: 90 + offset, width: 720, height: 420,
      minWidth: 420, minHeight: 200, position: 0.3,
      ...options,
    });
    this.element.classList.add('cr-database-window');
    this.store = store ?? new SourceStore(table);
    this.sessionCall = session;   // asks the server who is signed in
    this.canWrite = false;         // until the server says the user may
    this.current = null;   // { id, name, content, updated_at } or, for a new record, id null
    this._loadToken = 0;
    this._suppressSelect = false;

    this.listPanel = new ListPanel({ emptyText: 'No records', multiple: true });
    this.records = new Map();   // id -> record, as last listed
    // Several records selected: { ids, category } - category is the one
    // chosen for all of them (null until one is), which Save stores.
    this.batch = null;
    this.recordPanel = new RecordPanel({ language: cls.language });
    this.left = this.listPanel;
    this.right = this.recordPanel;

    // Select: which category the list shows; null (Any) shows every record.
    this.filter = null;
    this.selectMenu = this.buttonBar.add(new Menu('Select'));
    this.selectMenu.addItem('Any', () => this.setFilter(null), { checked: () => this.filter == null });
    this.selectMenu.addSeparator();
    for (const { value, label } of CATEGORIES) {
      this.selectMenu.addItem(label, () => this.setFilter(value), { checked: () => this.filter === value });
    }
    this.newButton = this.buttonBar.addButton('New', () => this.newRecord());
    this.saveButton = this.buttonBar.addButton('Save', () => this.save());
    this.deleteButton = this.buttonBar.addButton('Delete', () => this.deleteRecord());
    this.buttonBar.addButton('Refresh', () => this.refresh());
    if (cls.consoleClass) {
      this.compileButton = this.buttonBar.addButton('Compile', () => this.compile());
    }
    // Category: the record's category (default Mobile Game), saved with it;
    // with several records selected, the category Save gives them all.
    this.category = DEFAULT_CATEGORY;
    this.categoryMenu = this.buttonBar.add(new Menu('Category'));
    for (const { value, label } of CATEGORIES) {
      this.categoryMenu.addItem(label, () => this.setCategory(value),
        { checked: () => this.shownCategory === value, enabled: () => Boolean(this.current || this.batch) });
    }
    if (cls.consoleClass) {
      this.consoleButton = this.buttonBar.addButton('Open in Console', () => this.openInConsole());
    }
    this.buttonBar.add(new Spacer());
    this.status = this.buttonBar.add(new Label());

    this.listPanel.element.addEventListener('select', (e) => this._onSelect(e.detail.items));
    this.recordPanel.element.addEventListener('change', () => this.updateButtons());
    // Enter and Ctrl/Cmd+S save, as the Save button does: only when it is enabled.
    const saveIfEnabled = () => { if (this.saveButton.enabled) this.save(); };
    this.recordPanel.element.addEventListener('submit', saveIfEnabled);
    this.element.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveIfEnabled(); }
    });
    // Settings > Database switched server: reload from the new one.
    this._onServerChange = () => { if (this.isOpen) this.reload(); };
    document.addEventListener('cr-dbserverchange', this._onServerChange);
    // Settings > User switched user: show that user's space.
    document.addEventListener('cr-userchange', this._onServerChange);
    this.updateButtons();
  }

  /** True when the record being edited, or the records selected, have
   *  changes that are not saved. */
  get dirty() {
    if (this.batch) return this.batchChanges().length > 0;
    if (!this.current) return false;
    return this.recordPanel.name !== (this.current.name ?? '')
      || this.recordPanel.content !== (this.current.content ?? '')
      || this.category !== categoryOf(this.current);
  }

  open(viewport) {
    const wasOpen = this.isOpen;
    super.open(viewport);
    if (!wasOpen) this.reload();
    return this;
  }

  /** Closing with unsaved changes asks first; the window keeps its state. */
  close() {
    if (!this._confirmDiscard()) return false;
    return super.close();
  }

  /**
   * Refresh: reloads the record list from the server and starts afresh -
   * nothing selected and nothing in the editor. Unsaved changes are asked
   * about first. Returns false if the user kept them.
   */
  async refresh() {
    if (!this._confirmDiscard()) return false;
    this.batch = null;
    this.listPanel.selectedValues = [];
    this._showRecord(null);
    await this.reload();
    return true;
  }

  /** Reloads the record list from the server, keeping the selection. */
  async reload() {
    this.setStatus('Loading…');
    this.canWrite = canWriteDatabase(await this.sessionCall());
    try {
      // Listed by name, ignoring case (the server gives them by id).
      const all = [...(await this.store.list() ?? [])];
      this.records = new Map(all.map((r) => [r.id, r]));
      const records = all.filter((r) => this.filter == null || categoryOf(r) === this.filter).sort((x, y) => String(x.name ?? '')
        .localeCompare(String(y.name ?? ''), undefined, { sensitivity: 'base' }) || x.id - y.id);
      this._suppressSelect = true;
      this.listPanel.items = records.map((r) => ({ value: r.id, label: rowLabel(r) }));
      this._suppressSelect = false;
      // Records selected together that are no longer listed (deleted, or
      // not in the category shown) drop out of the selection.
      if (this.batch) this._syncBatch();
      // The record being edited may have been deleted elsewhere.
      if (this.current?.id != null && !all.some((r) => r.id === this.current.id) && !this.dirty) {
        this._showRecord(null);
      }
      const space = this.store.space;
      const shown = this.filter == null ? '' : ` (${CATEGORIES.find((c) => c.value === this.filter)?.label})`;
      this.setStatus(`${records.length} record${records.length === 1 ? '' : 's'}${shown} · `
        + `${space == null ? '' : `${space || 'shared'} · `}${this.store.baseUrl}`);
    } catch (e) {
      this._suppressSelect = false;
      this.setStatus(e.message, 'error');
    }
    this.updateButtons();
  }

  /** Shows only the records of one category (null: all of them). */
  setFilter(category) {
    this.filter = category;
    this.reload();
  }

  /** The category the Category menu checks: the record's, or with several
   *  selected the one chosen for them, else the one they share (if any). */
  get shownCategory() {
    if (!this.batch) return this.category;
    if (this.batch.category) return this.batch.category;
    const shared = new Set(this.batchRecords().map((r) => categoryOf(r)));
    return shared.size === 1 ? [...shared][0] : null;
  }

  /** Chooses a category for the record, or for every record selected. Save stores it. */
  setCategory(value) {
    if (this.batch) {
      this.batch.category = value;
      const n = this.batchChanges().length;
      const label = CATEGORIES.find((c) => c.value === value)?.label;
      this.setStatus(n === 0 ? `All ${this.batch.ids.length} records are already ${label}`
        : `${label} for ${n} record${n === 1 ? '' : 's'} — Save to store it`);
    } else {
      this.category = value;
    }
    this.updateButtons();
  }

  /** The records selected together, as last listed. */
  batchRecords() {
    return this.batch ? this.batch.ids.map((id) => this.records.get(id)).filter(Boolean) : [];
  }

  /** The records selected together whose category Save would change. */
  batchChanges() {
    const category = this.batch?.category;
    if (!category) return [];
    return this.batchRecords().filter((r) => categoryOf(r) !== category);
  }

  /** Starts a new, unsaved record. */
  newRecord() {
    if (!this._confirmDiscard()) return;
    this.batch = null;
    this._selectId(null);
    // A new record starts in the category being shown, if there is one.
    this._showRecord({ id: null, name: '', content: '', category: this.filter ?? DEFAULT_CATEGORY });
    this.recordPanel.focusName();
    this.setStatus('New record — Save to create it');
  }

  /** Creates or updates the record being edited; with several records
   *  selected, stores the category chosen for them. */
  async save() {
    if (this.batch) return this.saveBatch();
    if (!this.current || !this.canWrite) return null;
    const name = this.recordPanel.name.trim();
    if (!name) {
      this.setStatus('A name is required', 'error');
      this.recordPanel.focusName();
      return null;
    }
    const fields = { name, content: this.recordPanel.content, category: this.category };
    if (this.current.compiled_code !== undefined) fields.compiled_code = this.current.compiled_code;
    this.setStatus('Saving…');
    try {
      const saved = this.current.id == null
        ? await this.store.create(fields)
        : await this.store.update(this.current.id, fields);
      this._showRecord(saved);
      await this.reload();
      this._selectId(saved.id);
      this.setStatus(`Saved "${saved.name}"`);
      return saved;
    } catch (e) {
      this.setStatus(e.message, 'error');
      return null;
    }
  }

  /**
   * Gives every selected record the category chosen for them (only the
   * category is sent), one record at a time. The selection stays; a record
   * that fails is reported and the rest are still saved. Returns the
   * number saved.
   */
  async saveBatch() {
    if (!this.batch || !this.canWrite) return 0;
    const category = this.batch.category;
    const label = CATEGORIES.find((c) => c.value === category)?.label;
    const changes = this.batchChanges();
    let saved = 0;
    const failed = [];
    for (const record of changes) {
      this.setStatus(`Saving ${saved + failed.length + 1} of ${changes.length}…`);
      try {
        await this.store.update(record.id, { category });
        saved += 1;
      } catch (e) {
        failed.push(`"${record.name}": ${e.message}`);
      }
    }
    await this.reload();
    if (this.batch) this.batch.category = null;   // stored: nothing left to save
    this.updateButtons();
    if (failed.length > 0) {
      this.setStatus(`Saved ${saved} of ${changes.length}; could not save ${failed.join('; ')}`, 'error');
    } else {
      this.setStatus(`Set ${saved} record${saved === 1 ? '' : 's'} to ${label}`);
    }
    return saved;
  }

  /** Deletes the record being edited, after asking. */
  async deleteRecord() {
    const record = this.current;
    if (!record) return;
    if (record.id == null) { this._showRecord(null); this.setStatus('New record discarded'); return; }
    if (!confirm(`Delete "${record.name}" (#${record.id}) from the database?`)) return;
    this.setStatus('Deleting…');
    try {
      await this.store.remove(record.id);
      this._showRecord(null);
      this._selectId(null);
      await this.reload();
      this.setStatus(`Deleted "${record.name}"`);
    } catch (e) {
      this.setStatus(e.message, 'error');
    }
  }

  /**
   * Compiles the record's source (as it is in the editor) with the matching
   * console's compiler. On success the compiled chunk, as JSON, goes in the
   * record's compiled_code field and the record is saved. On failure nothing is
   * stored or saved, and the errors are shown in the status (the full text
   * in its tooltip). Returns the saved record, or null.
   */
  async compile() {
    const Console = this.constructor.consoleClass;
    if (!Console || !this.current || !this.canWrite) return null;
    const source = this.recordPanel.content;
    const filename = `${this.recordPanel.name.trim() || 'record'}${Console.fileExtension}`;
    let result;
    try {
      result = Console.compileSource(source, filename);
    } catch (e) {
      this.setStatus(`Compile failed: ${e.message}`, 'error');
      return null;
    }
    if (!result.chunk) {
      const n = result.errorCount;
      this.setStatus(`${n} compile error${n === 1 ? '' : 's'}: ${result.errors.trim().split('\n')[0]}`, 'error');
      this.status.element.title = result.errors;
      return null;
    }
    // The hash of the source lets a loader tell later whether the code still
    // matches the record's content (src/vm/program-loader.js).
    this.current.compiled_code = chunkToJsonString(result.chunk, { sourceHash: sourceHash(source) });
    const saved = await this.save();
    if (saved) {
      const stored = typeof saved.compiled_code === 'string' && saved.compiled_code.length > 0;
      this.setStatus(stored ? `Compiled and saved "${saved.name}"`
        : `Compiled "${saved.name}", but the server did not store the compiled code`, stored ? undefined : 'error');
    }
    return saved;
  }

  /** Opens the record's content in a new console of the matching language. */
  openInConsole() {
    const Console = this.constructor.consoleClass;
    if (!Console || !this.current || !this.parent) return null;
    const scriptName = this.recordPanel.name.trim() || this.current.name || null;
    return new Console({
      text: this.recordPanel.content,
      scriptName,
      scriptOwner: this.current.owner ?? '',
      compiled: this.current.compiled_code ?? null,
      priority: this.current.priority ?? DEFAULT_PRIORITY,
    }).open(this.parent);
  }


  setStatus(text, tone) {
    this.status.text = text;
    this.status.tone = tone;
    this.status.element.title = text;
    this.buttonBar.layout();
  }

  /** The window's title: the table, and the category of the record being edited. */
  updateTitle() {
    const base = `${TABLES[this.constructor.table].title} Database`;
    if (this.batch) {
      const label = CATEGORIES.find((c) => c.value === this.shownCategory)?.label;
      this.title = `${base}: ${this.batch.ids.length} records${label ? ` · ${label}` : ''}`;
      return;
    }
    const label = this.current ? CATEGORIES.find((c) => c.value === this.category)?.label : null;
    this.title = label ? `${base}: ${label}` : base;
  }

  updateButtons() {
    this.updateTitle();
    const editing = Boolean(this.current);
    const selected = this.current?.id != null;   // a record from the list, not a new one
    // Save: always there; enabled once the selected (or new) record's text has
    // changed, or a category has been chosen for the records selected.
    this.saveButton.enabled = this.canWrite && (editing || Boolean(this.batch)) && this.dirty;
    this.saveButton.element.title = this.canWrite ? ''
      : 'Sign in as a user who may write to the database to save';
    // Delete: only for a record selected in the list (one at a time).
    this.deleteButton.enabled = selected && !this.batch;
    if (this.consoleButton) this.consoleButton.enabled = editing;
    if (this.compileButton) {
      this.compileButton.visible = this.canWrite;
      this.compileButton.enabled = this.canWrite && editing;
    }
    this.buttonBar.layout();
  }

  /** The list's selection changed: one record is loaded for editing;
   *  several are selected together; none clears the editor. */
  async _onSelect(items) {
    if (this._suppressSelect) return;
    const ids = items.map((item) => item.value);
    if (ids.length === 1 && !this.batch && ids[0] === (this.current?.id ?? null)) return;
    if (!this._confirmDiscard()) { this._restoreSelection(); return; }
    if (ids.length > 1) {
      // A category chosen for the earlier selection carries over to the new one.
      this.batch = { ids, category: this.batch?.category ?? null };
      this._loadToken += 1;   // a record still loading is no longer wanted
      this._showRecord(null);
      this.recordPanel.caption = `${ids.length} records selected`;
      const pending = this.batchChanges().length;
      this.setStatus(`${ids.length} records selected — choose a Category, then Save${pending ? ` (${pending} to change)` : ''}`);
      return;
    }
    this.batch = null;
    if (ids.length === 0) {
      this._loadToken += 1;
      this._showRecord(null);
      this.setStatus('');
      return;
    }
    await this.load(ids[0]);
  }

  /** Puts the list's selection back as it was: the batch, the record, or none. */
  _restoreSelection() {
    this._suppressSelect = true;
    try {
      if (this.batch) this.listPanel.selectedValues = this.batch.ids;
      else this.listPanel.selectedValues = this.current?.id != null ? [this.current.id] : [];
    } finally { this._suppressSelect = false; }
  }

  /** After a reload: the batch is the records still selected in the list. */
  _syncBatch() {
    const ids = this.listPanel.selectedValues;
    if (ids.length > 1) {
      this.batch.ids = ids;
      this.recordPanel.caption = `${ids.length} records selected`;
    } else {
      this.batch = null;
      this._showRecord(null);
      if (ids.length === 1) this.load(ids[0]);
    }
  }

  /** Fetches a record and shows it for editing. */
  async load(id) {
    const token = ++this._loadToken;
    this.setStatus('Loading…');
    try {
      const record = await this.store.get(id);
      if (token !== this._loadToken) return;   // a later selection won
      this._showRecord(record);
      this.setStatus(`#${record.id} ${record.name}`);
    } catch (e) {
      if (token === this._loadToken) this.setStatus(e.message, 'error');
    }
  }

  _showRecord(record) {
    this.current = record ? { ...record } : null;
    this.recordPanel.name = record?.name ?? '';
    this.recordPanel.content = record?.content ?? '';
    this.category = categoryOf(record);
    this.recordPanel.enabled = Boolean(record);
    this.recordPanel.caption = !record ? ''
      : record.id == null ? 'new record'
        : `#${record.id}${record.updated_at ? ` · updated ${formatTime(record.updated_at)}` : ''}`;
    this.updateButtons();
  }

  _confirmDiscard() {
    if (!this.dirty) return true;
    if (this.batch) {
      const n = this.batchChanges().length;
      return confirm(`Discard the category chosen for ${n} record${n === 1 ? '' : 's'}?`);
    }
    return confirm(`Discard unsaved changes to "${this.recordPanel.name || 'new record'}"?`);
  }

  _selectId(id) {
    this._suppressSelect = true;
    try { this.listPanel.select(id == null ? -1 : this.listPanel.items.findIndex((i) => i.value === id)); }
    finally { this._suppressSelect = false; }
  }

  dispose() {
    document.removeEventListener('cr-dbserverchange', this._onServerChange);
    document.removeEventListener('cr-userchange', this._onServerChange);
    instances.delete(this.constructor);
    super.dispose();
  }
}

function rowLabel(record) {
  return `${String(record.id).padStart(4)}  ${record.name ?? ''}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export class PythonDatabaseWindow extends DatabaseWindow {
  static get table() { return 'python'; }
  static get language() { return 'python'; }
  static get consoleClass() { return PythonConsoleWindow; }
}
