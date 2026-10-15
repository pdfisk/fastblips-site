// ApplicationsWindow: the singleton window, opened by the Navbar's
// Applications button, that lists the compiled apps (programs in the Basic
// and Python tables saved with their compiled code, by name) so they can be
// launched. Choosing an app and pressing Launch (or double-clicking it, or
// pressing Enter) runs it in a new Desktop launch window. The list is read
// from the database each time the window is opened, and by Refresh; it is
// also read again when the database server or the user changes.

import { Window } from './window.js';
import { DesktopLaunchWindow } from './launch-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { listApps } from '../app-list.js';
import { RUN_TABLES } from '../run-app.js';
import { userName } from '../db-client.js';

let instance = null;

/** The list row text for an app: its name, then (Python) or · shared. */
export function appLabel(app, user = userName()) {
  return `${app.name}${app.table === 'python' ? ' (Python)' : ''}${user && !app.owner ? ' · shared' : ''}`;
}

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

    this.list = new ListPanel({ emptyText: 'Loading...' });
    this.content = this.list;
    this.launchButton = this.buttonBar.addButton('Launch', () => this.launch());
    this.refreshButton = this.buttonBar.addButton('Refresh', () => this.refresh());
    this.list.element.addEventListener('select', () => this.updateButtons());
    this.list.element.addEventListener('dblclick', () => this.launch());
    this.list.list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.launch(); }
    });
    this._forget = () => { this._stale = true; if (this.isOpen) this.refresh(); };
    document.addEventListener('cr-dbserverchange', this._forget);
    document.addEventListener('cr-userchange', this._forget);
    this.updateButtons();
  }

  /** The app whose row is selected, or null. */
  get selectedApp() {
    const index = this.list.selectedIndex;
    return index < 0 ? null : this.apps[index] ?? null;
  }

  /**
   * Reads the apps again and shows them, keeping the selection if the app is
   * still there. Resolves once the list is up to date (a failed read shows
   * its reason in the list instead).
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
    const key = (app) => `${app.table}/${app.owner}/${app.name}`;
    this.list.emptyText = emptyText;
    this.list.items = this.apps.map((app) => ({ label: appLabel(app), value: key(app) }));
    this.updateButtons();
  }

  /** Runs the selected app in a new Desktop launch window; null if none is selected. */
  launch() {
    const app = this.selectedApp;
    if (!app || !this.parent) return null;
    const { record } = app;
    return new DesktopLaunchWindow({
      title: app.name,
      source: record.content ?? '',
      language: this._languages[app.table],
      compiled: record.compiled_code,
      priority: record.priority ?? undefined,
    }).open(this.parent);
  }

  updateButtons() {
    this.launchButton.enabled = this.selectedApp !== null;
    this.buttonBar.layout();
  }

  /** Shows the window and reads the apps afresh. */
  open(viewport) {
    super.open(viewport);
    this.refresh();
    this.list.list.focus();
    return this;
  }

  dispose() {
    document.removeEventListener('cr-dbserverchange', this._forget);
    document.removeEventListener('cr-userchange', this._forget);
    super.dispose();
    instance = null;
  }
}
