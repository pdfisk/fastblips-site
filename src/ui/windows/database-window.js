// DatabaseWindow: a browser for one table of source records on the database
// server (rails/server) - the records listed on the left, the selected one
// edited on the right. Records can be created, viewed, edited and deleted.
// BasicDatabaseWindow and PythonDatabaseWindow choose the table; there is
// one window of each, opened from the Database menu.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { RecordPanel } from '../widgets/record-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { Menu } from '../widgets/menu.js';
import { SourceStore, TABLES } from '../db-client.js';
import { BasicConsoleWindow } from './basic-console-window.js';
import { PythonConsoleWindow } from './python-console-window.js';
import { chunkToJsonString, sourceHash } from '../../vm/chunk-json.js';

const instances = new Map();   // one window per subclass
const DEFAULT_PRIORITY = 3;

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

  constructor({ store, ...options } = {}) {
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
    this.current = null;   // { id, name, content, updated_at } or, for a new record, id null
    this._loadToken = 0;
    this._suppressSelect = false;

    this.listPanel = new ListPanel({ emptyText: 'No records' });
    this.recordPanel = new RecordPanel({ language: cls.language });
    this.left = this.listPanel;
    this.right = this.recordPanel;

    this.newButton = this.buttonBar.addButton('New', () => this.newRecord());
    this.saveButton = this.buttonBar.addButton('Save', () => this.save());
    this.deleteButton = this.buttonBar.addButton('Delete', () => this.deleteRecord());
    this.buttonBar.addButton('Refresh', () => this.refresh());
    if (cls.consoleClass) {
      this.compileButton = this.buttonBar.addButton('Compile', () => this.compile());
    }
    // Priority: the record's priority, 1 to 5 (default 3), saved with it.
    this.priority = DEFAULT_PRIORITY;
    this.priorityMenu = this.buttonBar.add(new Menu('Priority'));
    for (let level = 1; level <= 5; level++) {
      this.priorityMenu.addItem(String(level), () => { this.priority = level; this.updateButtons(); },
        { checked: () => this.priority === level, enabled: () => Boolean(this.current) });
    }
    if (cls.consoleClass) {
      this.consoleButton = this.buttonBar.addButton('Open in Console', () => this.openInConsole());
    }
    this.buttonBar.add(new Spacer());
    this.status = this.buttonBar.add(new Label());

    this.listPanel.element.addEventListener('select', (e) => this._onSelect(e.detail.item));
    this.recordPanel.element.addEventListener('change', () => this.updateButtons());
    this.recordPanel.element.addEventListener('submit', () => this.save());
    // Ctrl/Cmd+S saves.
    this.element.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
    });
    // Settings > Database switched server: reload from the new one.
    this._onServerChange = () => { if (this.isOpen) this.refresh(); };
    document.addEventListener('cr-dbserverchange', this._onServerChange);
    this.updateButtons();
  }

  /** True when the record being edited has changes that are not saved. */
  get dirty() {
    if (!this.current) return false;
    return this.recordPanel.name !== (this.current.name ?? '')
      || this.recordPanel.content !== (this.current.content ?? '')
      || this.priority !== (this.current.priority ?? DEFAULT_PRIORITY);
  }

  open(viewport) {
    const wasOpen = this.isOpen;
    super.open(viewport);
    if (!wasOpen) this.refresh();
    return this;
  }

  /** Closing with unsaved changes asks first; the window keeps its state. */
  close() {
    if (this.dirty && !confirm(`Discard unsaved changes to "${this.recordPanel.name || 'new record'}"?`)) {
      return false;
    }
    return super.close();
  }

  /** Reloads the record list from the server, keeping the selection. */
  async refresh() {
    this.setStatus('Loading…');
    try {
      // Listed by name, ignoring case (the server gives them by id).
      const records = [...(await this.store.list() ?? [])].sort((x, y) => String(x.name ?? '')
        .localeCompare(String(y.name ?? ''), undefined, { sensitivity: 'base' }) || x.id - y.id);
      this._suppressSelect = true;
      this.listPanel.items = records.map((r) => ({ value: r.id, label: rowLabel(r) }));
      this._suppressSelect = false;
      // The record being edited may have been deleted elsewhere.
      if (this.current?.id != null && !records.some((r) => r.id === this.current.id) && !this.dirty) {
        this._showRecord(null);
      }
      this.setStatus(`${records.length} record${records.length === 1 ? '' : 's'} · ${this.store.baseUrl}`);
    } catch (e) {
      this._suppressSelect = false;
      this.setStatus(e.message, 'error');
    }
    this.updateButtons();
  }

  /** Starts a new, unsaved record. */
  newRecord() {
    if (!this._confirmDiscard()) return;
    this._selectId(null);
    this._showRecord({ id: null, name: '', content: '' });
    this.recordPanel.focusName();
    this.setStatus('New record — Save to create it');
  }

  /** Creates or updates the record being edited. */
  async save() {
    if (!this.current) return null;
    const name = this.recordPanel.name.trim();
    if (!name) {
      this.setStatus('A name is required', 'error');
      this.recordPanel.focusName();
      return null;
    }
    const fields = { name, content: this.recordPanel.content, priority: this.priority };
    if (this.current.compiled_code !== undefined) fields.compiled_code = this.current.compiled_code;
    this.setStatus('Saving…');
    try {
      const saved = this.current.id == null
        ? await this.store.create(fields)
        : await this.store.update(this.current.id, fields);
      this._showRecord(saved);
      await this.refresh();
      this._selectId(saved.id);
      this.setStatus(`Saved "${saved.name}"`);
      return saved;
    } catch (e) {
      this.setStatus(e.message, 'error');
      return null;
    }
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
      await this.refresh();
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
    if (!Console || !this.current) return null;
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
      compiled: this.current.compiled_code ?? null,
      priority: this.priority,
    }).open(this.parent);
  }


  setStatus(text, tone) {
    this.status.text = text;
    this.status.tone = tone;
    this.status.element.title = text;
    this.buttonBar.layout();
  }

  updateButtons() {
    const editing = Boolean(this.current);
    this.saveButton.enabled = editing && (this.dirty || this.current.id == null);
    this.deleteButton.enabled = editing;
    if (this.consoleButton) this.consoleButton.enabled = editing;
    if (this.compileButton) this.compileButton.enabled = editing;
    this.buttonBar.layout();
  }

  async _onSelect(item) {
    if (this._suppressSelect) return;
    const previous = this.current?.id ?? null;
    if (!item) return;
    if (item.value === previous) return;
    if (!this._confirmDiscard()) { this._selectId(previous); return; }
    await this.load(item.value);
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
    this.priority = record?.priority ?? DEFAULT_PRIORITY;
    this.recordPanel.enabled = Boolean(record);
    this.recordPanel.caption = !record ? ''
      : record.id == null ? 'new record'
        : `#${record.id}${record.updated_at ? ` · updated ${formatTime(record.updated_at)}` : ''}`;
    this.updateButtons();
  }

  _confirmDiscard() {
    return !this.dirty || confirm(`Discard unsaved changes to "${this.recordPanel.name || 'new record'}"?`);
  }

  _selectId(id) {
    this._suppressSelect = true;
    try { this.listPanel.select(id == null ? -1 : this.listPanel.items.findIndex((i) => i.value === id)); }
    finally { this._suppressSelect = false; }
  }

  dispose() {
    document.removeEventListener('cr-dbserverchange', this._onServerChange);
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

export class BasicDatabaseWindow extends DatabaseWindow {
  static get table() { return 'basic'; }
  static get language() { return 'vb'; }
  static get consoleClass() { return BasicConsoleWindow; }
}

export class PythonDatabaseWindow extends DatabaseWindow {
  static get table() { return 'python'; }
  static get language() { return 'python'; }
  static get consoleClass() { return PythonConsoleWindow; }
}
