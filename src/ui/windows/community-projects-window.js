// CommunityProjectsWindow: a Shared Projects window, opened by the Navbar's
// Shared Projects button (each press opens a new one, as a console does), that lists every project other users have shared
// (the "shared" flag of a project; the signed-in user's own are in My Projects
// and are left out), in a grid with the
// columns Name, Owner, Scripts and Updated, so they can be launched. The
// window is split by a vertical divider: the grid on the left, and on the
// right a tabbed detail panel for the selected project - Details (name,
// owner, description), Scripts (its scripts, in order) and Source (the
// selected script's source, read only). A project keeps its own copies of
// its scripts, so they are read with it. Shared projects can be launched and
// copied but never modified. Choosing
// a project and pressing Launch (or double-clicking it, or pressing Enter)
// runs the project as it was last saved in a new Desktop launch window. Copy
// stores a copy of the chosen project in My Projects, under a name that can be
// edited first (see CopyProjectWindow). The grid is read from the database each
// time the window is opened, and by Refresh; it is also read again when the
// database server or the user changes.

import { HSplitWindow } from './hsplit-window.js';
import { DesktopLaunchWindow, MobileLaunchWindow, addLaunchItems, launchWeb } from './launch-window.js';
import { Menu } from '../widgets/menu.js';
import { GridPanel } from '../widgets/grid-panel.js';
import { TabPanel } from '../widgets/tab-panel.js';
import { TextPanel } from '../widgets/text-panel.js';
import { ListPanel } from '../widgets/list-panel.js';
import {
  allProjectStore, libraryProjects, scriptLabel, projectDetails, projectPrograms,
} from '../projects.js';
import { RUN_TABLES } from '../run-app.js';
import { CopyProjectWindow } from './copy-project-window.js';
import { spaceName, userName } from '../db-client.js';
import { Toast } from '../toast.js';

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

/**
 * The caption for a Shared Projects window joining the viewport: plain
 * "Shared Projects" when it is the only one, else numbered with the lowest
 * number no other open Shared Projects window has.
 */
export function sharedProjectsTitle(viewport, self = null) {
  const used = new Set((viewport?.windows ?? [])
    .filter((w) => w !== self && w instanceof CommunityProjectsWindow)
    .map((w) => (w.title === 'Shared Projects' ? 1 : Number(/^Shared Projects (\d+)$/.exec(w.title)?.[1]))));
  let n = 1;
  while (used.has(n)) n++;
  return n === 1 ? 'Shared Projects' : `Shared Projects ${n}`;
}

// How many have been opened, so each new window cascades from the last (as consoles do).
let opened = 0;

export class CommunityProjectsWindow extends HSplitWindow {
  /**
   * @param {{list?: () => Promise<object[]>, get?: (id: number) => Promise<object>}} [options] -
   *   how the projects are read (tests): all of them, and one by id
   */
  constructor({ list, get } = {}) {
    const offset = (opened++ % 8) * 24;   // cascade each new window
    super({ title: 'Shared Projects', x: 220 + offset, y: 90 + offset, width: 760, height: 380, minWidth: 480, minHeight: 220, position: 0.5 });
    this.element.classList.add('cr-libraries-window');
    this._read = list ?? (() => allProjectStore().list());
    // A project as it is now saved, with its copies of its scripts.
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
    // The detail panel: Details, Scripts and Source tabs for the selected project.
    this.detailsPanel = new TextPanel({ readOnly: true });
    this.scriptsPanel = new ListPanel({ emptyText: 'No project selected' });
    this.sourcePanel = new TextPanel({ readOnly: true });
    this.tabs = new TabPanel();
    this.tabs.addTab('Details', this.detailsPanel);
    this.tabs.addTab('Scripts', this.scriptsPanel);
    this.tabs.addTab('Source', this.sourcePanel);
    this.left = this.grid;
    this.right = this.tabs;
    this.full = null;          // the selected project with its scripts read, once read
    this._detailToken = 0;
    this.scriptsPanel.element.addEventListener('select', () => this._showSource());
    // As in a console: Launch > Desktop, Mobile or Web.
    this.launchMenu = this.buttonBar.add(new Menu('Launch'));
    addLaunchItems(this.launchMenu, (target) => this.launch(target), () => this.selectedProject !== null);
    this.copyButton = this.buttonBar.addButton('Copy', () => this.copy());
    this.refreshButton = this.buttonBar.addButton('Refresh', () => this.refresh());
    this.grid.element.addEventListener('select', () => { this.updateButtons(); this._syncDetail(); });
    this.grid.element.addEventListener('dblclick', (e) => { if (e.target.closest('td')) this.launch(); });
    this.grid.grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.launch(); }
    });
    this._forget = () => { this._stale = true; if (this.isOpen) this.refresh(); };
    document.addEventListener('cr-dbserverchange', this._forget);
    document.addEventListener('cr-userchange', this._forget);
    this.updateButtons();
    this._syncDetail();
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
        this.projects = libraryProjects(records, userName());
        this._show(this.projects.length ? '' : 'No projects shared by other users yet');
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
    this._syncDetail(true);
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
    const { programs } = projectPrograms(full.scripts, this._languages);
    if (programs.length === 0) return null;
    const Cls = target === 'mobile' ? MobileLaunchWindow : DesktopLaunchWindow;
    return new Cls({ title: project.name, programs }).open(this.parent);
  }

  /**
   * Opens the Copy Project dialog for the selected project: its name can be
   * changed there before the copy (with copies of its scripts) is
   * stored in My Projects. Needs a signed-in user, as My Projects is the
   * user's own space. Resolves to the dialog; null if there is no project
   * selected or nobody is signed in.
   */
  async copy() {
    const project = this.selectedProject;
    if (!project || !this.parent) return null;
    if (!spaceName()) {
      Toast.show(this.parent, { kind: 'error', message: 'Sign in (File > Sign In) to copy a shared project to My Projects' });
      return null;
    }
    let full;
    try {
      full = await this._get(project.id);   // as it is now saved
    } catch (e) {
      Toast.show(this.parent, { kind: 'error', message: `Cannot read the project: ${e.message}` });
      return null;
    }
    return new CopyProjectWindow({ project: full }).open(this.parent);
  }

  updateButtons() {
    this.copyButton.enabled = this.selectedProject !== null;
    this.buttonBar.layout();
  }

  // Fills the tabs for the selected project (or empties them), and reads the
  // project with its scripts read for the Source tab. Unless force is
  // set, nothing is done when the project shown is still the selected one.
  _syncDetail(force = false) {
    const project = this.selectedProject;
    const key = project ? projectKey(project) : null;
    if (!force && key === this._detailKey) return;
    this._detailKey = key;
    const token = ++this._detailToken;
    this.full = null;
    this.detailsPanel.text = project ? projectDetails(project, projectUpdated(project)) : '';
    this.scriptsPanel.emptyText = project ? 'This project has no scripts' : 'No project selected';
    this.scriptsPanel.items = (project?.scripts ?? []).map((script, i) => ({
      value: String(i), label: scriptLabel(script),
    }));
    this.scriptsPanel.select(this.scriptsPanel.items.length ? 0 : -1);
    this._showSource();
    if (!project) return;
    this._get(project.id).then(
      (full) => { if (token === this._detailToken) { this.full = full; this._showSource(); } },
      (err) => { if (token === this._detailToken) this.sourcePanel.text = `Cannot read the project: ${err.message}`; },
    );
  }

  // Shows the source of the script selected in the Scripts tab.
  _showSource() {
    const item = this.scriptsPanel.selectedItem;
    if (!item) { this.sourcePanel.text = ''; return; }
    const script = this.full?.scripts?.[Number(item.value)];
    this.sourcePanel.text = !this.full ? 'Loading...' : script?.content ?? '';
  }

  /**
   * Shows the window and reads the projects afresh. When it is added to the
   * viewport, its caption is numbered if other Shared Projects windows are
   * open there: Shared Projects, Shared Projects 2, ... (the lowest free number).
   */
  open(viewport) {
    if (this.parent !== viewport) this.title = sharedProjectsTitle(viewport, this);
    super.open(viewport);
    this.refresh();
    this.grid.grid.focus();
    return this;
  }

  /** Closes the window; a closed one is done with, so it stops listening for changes. */
  close() {
    const closed = super.close();
    if (closed) this._stopListening();
    return closed;
  }

  dispose() {
    this._stopListening();
    super.dispose();
  }

  _stopListening() {
    document.removeEventListener('cr-dbserverchange', this._forget);
    document.removeEventListener('cr-userchange', this._forget);
  }
}
