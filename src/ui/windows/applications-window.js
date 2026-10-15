// ApplicationsWindow: the singleton window, opened by the Navbar's
// Applications button, that shows the compiled apps (programs in the Basic
// and Python tables saved with their compiled code) in a grid with the
// columns Name, Owner and Updated, so they can be launched. Choosing an app and pressing Launch (or double-clicking it, or
// pressing Enter) runs it in a new Desktop launch window. The grid is read
// from the database each time the window is opened, and by Refresh; it is
// also read again when the database server or the user changes.

import { Window } from './window.js';
import { DesktopLaunchWindow, MobileLaunchWindow, addLaunchItems, launchWeb } from './launch-window.js';
import { Menu } from '../widgets/menu.js';
import { GridPanel } from '../widgets/grid-panel.js';
import { listApps } from '../app-list.js';
import { RUN_TABLES } from '../run-app.js';

let instance = null;

/** The Name cell for an app: its name, then (Python) for a MiniPy program. */
export function appLabel(app) {
  return `${app.name}${app.table === 'python' ? ' (Python)' : ''}`;
}

/** The Owner cell: the user whose space the app is in, or (shared). */
export function appOwner(app) {
  return app.owner || '(shared)';
}

/** The Updated cell: a time for today, else a date; empty if never recorded. */
export function appUpdated(app) {
  const iso = app.record?.updated_at;
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

const appKey = (app) => `${app.table}/${app.owner}/${app.name}`;

export class ApplicationsWindow extends Window {
  /** The single ApplicationsWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new ApplicationsWindow();
    return instance;
  }

  /** @param {{listApps?: () => Promise<object[]>}} [options] - how the apps are read (tests) */
  constructor({ listApps: read = listApps } = {}) {
    if (instance) throw new Error('ApplicationsWindow is a singleton; use ApplicationsWindow.instance');
    super({ title: 'Applications', x: 300, y: 90, width: 380, height: 320, minWidth: 260, minHeight: 180 });
    instance = this;
    this.element.classList.add('cr-applications-window');
    this._read = read;
    this._languages = Object.fromEntries(RUN_TABLES);
    this.apps = [];
    this._loading = null;
    this._stale = true;

    this.grid = new GridPanel({
      columns: [{ label: 'Name' }, { label: 'Owner', width: '110px' }, { label: 'Updated', width: '110px' }],
      emptyText: 'Loading...',
    });
    this.content = this.grid;
    // As in a console: Launch > Desktop, Mobile or Web.
    this.launchMenu = this.buttonBar.add(new Menu('Launch'));
    addLaunchItems(this.launchMenu, (target) => this.launch(target), () => this.selectedApp !== null);
    this.refreshButton = this.buttonBar.addButton('Refresh', () => this.refresh());
    this.grid.element.addEventListener('select', () => this.updateButtons());
    this.grid.element.addEventListener('dblclick', (e) => { if (e.target.closest('td')) this.launch(); });
    this.grid.grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.launch(); }
    });
    this._forget = () => { this._stale = true; if (this.isOpen) this.refresh(); };
    document.addEventListener('cr-dbserverchange', this._forget);
    document.addEventListener('cr-userchange', this._forget);
    this.updateButtons();
  }

  /** The app whose row is selected, or null. */
  get selectedApp() {
    const key = this.grid.selectedRow?.value;
    return key === undefined ? null : this.apps.find((app) => appKey(app) === key) ?? null;
  }

  /**
   * Reads the apps again and shows them, keeping the selection if the app is
   * still there. Resolves once the list is up to date (a failed read shows
   * its reason in the grid instead).
   */
  refresh() {
    this._stale = false;
    this._loading ??= Promise.resolve().then(() => this._read()).then(
      (apps) => { this.apps = apps; this._show(apps.length ? '' : 'No compiled apps: use Compile in a Database window'); },
      (err) => { this.apps = []; this._show(`Cannot read the database: ${err.message}`); },
    ).finally(() => { this._loading = null; });
    return this._loading;
  }

  _show(emptyText) {
    this.grid.emptyText = emptyText;
    this.grid.rows = this.apps.map((app) => ({
      value: appKey(app),
      cells: [appLabel(app), appOwner(app), appUpdated(app)],
      sort: [appLabel(app), appOwner(app), app.record?.updated_at ?? ''],   // Updated sorts by time, not text
    }));
    this.updateButtons();
  }

  /**
   * Launches the selected app (the Launch menu): in a new Desktop launch
   * window ('desktop', the default) or Mobile one ('mobile'), run from its
   * compiled code, or as a full page in a new browser tab ('web'). Returns
   * the window (for 'web', the address opened); null if none is selected.
   */
  launch(target = 'desktop') {
    const app = this.selectedApp;
    if (!app || !this.parent) return null;
    if (target === 'web') return launchWeb(app.name, app.owner);
    const { record } = app;
    const Cls = target === 'mobile' ? MobileLaunchWindow : DesktopLaunchWindow;
    return new Cls({
      title: app.name,
      source: record.content ?? '',
      language: this._languages[app.table],
      compiled: record.compiled_code,
      priority: record.priority ?? undefined,
    }).open(this.parent);
  }

  updateButtons() {
    this.buttonBar.layout();
  }

  /** Shows the window and reads the apps afresh. */
  open(viewport) {
    super.open(viewport);
    this.refresh();
    this.grid.grid.focus();
    return this;
  }

  dispose() {
    document.removeEventListener('cr-dbserverchange', this._forget);
    document.removeEventListener('cr-userchange', this._forget);
    super.dispose();
    instance = null;
  }
}
