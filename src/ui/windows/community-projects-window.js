// CommunityProjectsWindow: the singleton window, opened by the Navbar's
// Community Projects button, that lists every project that has been shared
// (the "shared" flag of a project), whoever owns it, in a grid with the
// columns Name, Owner, Scripts and Updated, so they can be launched. Choosing
// a project and pressing Launch (or double-clicking it, or pressing Enter)
// runs the project as it was last saved in a new Desktop launch window. The
// grid is read from the database each time the window is opened, and by
// Refresh; it is also read again when the database server or the user changes.

import { Window } from './window.js';
import { DesktopLaunchWindow, MobileLaunchWindow, addLaunchItems, launchWeb } from './launch-window.js';
import { Menu } from '../widgets/menu.js';
import { GridPanel } from '../widgets/grid-panel.js';
import { allProjectStore, sharedProjects } from '../projects.js';
import { RUN_TABLES } from '../run-app.js';

let instance = null;

/** The Owner cell: the user whose space the project is in, or (shared). */
export function projectOwner(project) {
  return project.owner || '(shared)';
}

/** The Scripts cell: how many scripts the project has. */
export function projectScriptCount(project) {
  return String((project.scripts ?? []).length);
}

/** The Updated cell: a time for today, else a date; empty if never recorded. */
export function projectUpdated(project) {
  const iso = project.updated_at;
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

const projectKey = (project) => String(project.id);

export class CommunityProjectsWindow extends Window {
  /** The single CommunityProjectsWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new CommunityProjectsWindow();
    return instance;
  }

  /**
   * @param {{list?: () => Promise<object[]>, get?: (id: number) => Promise<object>}} [options] -
   *   how the projects are read (tests): all of them, and one with its scripts' snapshots
   */
  constructor({ list, get } = {}) {
    if (instance) throw new Error('CommunityProjectsWindow is a singleton; use CommunityProjectsWindow.instance');
    super({ title: 'Community Projects', x: 300, y: 90, width: 440, height: 320, minWidth: 300, minHeight: 180 });
    instance = this;
    this.element.classList.add('cr-community-projects-window');
    this._read = list ?? (() => allProjectStore().list());
    this._get = get ?? ((id) => allProjectStore().get(id));
    this._languages = Object.fromEntries(RUN_TABLES);
    this.projects = [];
    this._loading = null;
    this._stale = true;

    this.grid = new GridPanel({
      columns: [{ label: 'Name' }, { label: 'Owner', width: '110px' }, { label: 'Scripts', width: '70px' },
        { label: 'Updated', width: '110px' }],
      emptyText: 'Loading...',
    });
    this.content = this.grid;
    // As in a console: Launch > Desktop, Mobile or Web.
    this.launchMenu = this.buttonBar.add(new Menu('Launch'));
    addLaunchItems(this.launchMenu, (target) => this.launch(target), () => this.selectedProject !== null);
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

  /** The project whose row is selected, or null. */
  get selectedProject() {
    const key = this.grid.selectedRow?.value;
    return key === undefined ? null : this.projects.find((p) => projectKey(p) === key) ?? null;
  }

  /**
   * Reads the shared projects again and shows them, keeping the selection if
   * the project is still there. Resolves once the list is up to date (a
   * failed read shows its reason in the grid instead).
   */
  refresh() {
    this._stale = false;
    this._loading ??= Promise.resolve().then(() => this._read()).then(
      (records) => {
        this.projects = sharedProjects(records);
        this._show(this.projects.length ? '' : 'No shared projects: tick Shared on a project in My Projects');
      },
      (err) => { this.projects = []; this._show(`Cannot read the database: ${err.message}`); },
    ).finally(() => { this._loading = null; });
    return this._loading;
  }

  _show(emptyText) {
    this.grid.emptyText = emptyText;
    this.grid.rows = this.projects.map((p) => ({
      value: projectKey(p),
      cells: [p.name, projectOwner(p), projectScriptCount(p), projectUpdated(p)],
      sort: [p.name, projectOwner(p), (p.scripts ?? []).length, p.updated_at ?? ''],   // Scripts and Updated sort by value, not text
    }));
    this.updateButtons();
  }

  /**
   * Launches the selected project (the Launch menu): every script, as the
   * project was last saved, in a new Desktop launch window ('desktop', the
   * default) or Mobile one ('mobile'), or as a full page in a new browser
   * tab ('web'). Resolves to the window (for 'web', the address opened);
   * null if none is selected or the project has nothing to run.
   */
  async launch(target = 'desktop') {
    const project = this.selectedProject;
    if (!project || !this.parent) return null;
    if (target === 'web') return launchWeb(project.name, project.owner ?? '', { project: true });
    const full = await this._get(project.id);
    const programs = (full.scripts ?? [])
      .filter((s) => this._languages[s.language])
      .map((s) => ({
        name: s.name,
        language: this._languages[s.language],
        source: s.content ?? '',
        compiled: s.compiled_code ?? null,
        priority: s.priority ?? undefined,
      }));
    if (programs.length === 0) return null;
    const Cls = target === 'mobile' ? MobileLaunchWindow : DesktopLaunchWindow;
    return new Cls({ title: project.name, programs }).open(this.parent);
  }

  updateButtons() {
    this.buttonBar.layout();
  }

  /** Shows the window and reads the projects afresh. */
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
