// ProjectsWindow: the singleton window for the projects on the database
// server (rails/server) - the projects of the page's space listed on the
// left (only those with an owner), the selected one edited on the right:
// its name, its description and its scripts, in order. Add puts a script in
// it, chosen from the user's own and those others have shared; Remove takes
// the selected one out; Up and Down move it. Projects can be created, edited
// and deleted. Opened from the Views menu.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { ProjectPanel } from '../widgets/project-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { Menu } from '../widgets/menu.js';
import { Separator } from '../widgets/separator.js';
import { ScriptPickerWindow } from './script-picker-window.js';
import { DesktopLaunchWindow, MobileLaunchWindow } from './launch-window.js';
import { BasicConsoleWindow } from './basic-console-window.js';
import { PythonConsoleWindow } from './python-console-window.js';
import { projectStore, scriptStore, byName, projectScript, availableScripts, sameList } from '../projects.js';

// The console class that compiles and runs a script, by the language it is saved with.
const LANGUAGES = { basic: BasicConsoleWindow, python: PythonConsoleWindow };

let instance = null;

export class ProjectsWindow extends HSplitWindow {
  /** The single ProjectsWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new ProjectsWindow();
    return instance;
  }

  /**
   * @param {object} options - Window options, plus `store` and `scripts`:
   *   the SourceStores for projects (the page's space on the server in use,
   *   by default) and for scripts (every space: Add offers the user's own
   *   and the ones others have shared).
   */
  constructor({ store, scripts, ...options } = {}) {
    super({
      title: 'Projects',
      x: 170, y: 110, width: 700, height: 440,
      minWidth: 440, minHeight: 280, position: 0.3,
      ...options,
    });
    instance ??= this;
    this.element.classList.add('cr-projects-window');
    this.store = store ?? projectStore();
    this.scriptStore = scripts ?? scriptStore();
    this.projects = [];    // the projects in the space, by name
    this.scripts = [];     // the scripts in every space, to choose from
    this.picker = null;    // the open ScriptPickerWindow, if any
    this.current = null;   // the project being edited; id null for a new one
    this._refreshToken = 0;
    this._suppressSelect = false;

    this.listPanel = new ListPanel({ emptyText: 'No projects' });
    this.projectPanel = new ProjectPanel();
    this.left = this.listPanel;
    this.right = this.projectPanel;

    // The commands are in two pulldown menus; their items are enabled by the
    // state at the moment the menu opens.
    const editing = () => Boolean(this.current);
    const at = () => this.projectPanel.selectedIndex;
    const projectsMenu = new Menu('Projects');
    projectsMenu.addItem('New', () => this.newProject());
    projectsMenu.addItem('Save', () => this.save(), { enabled: () => editing() && (this.dirty || this.current.id == null) });
    projectsMenu.addItem('Delete', () => this.deleteProject(), { enabled: editing });
    projectsMenu.addItem('Refresh', () => this.refresh());
    const scriptsMenu = new Menu('Scripts');
    scriptsMenu.addItem('Add', () => this.addScript(), { enabled: editing });
    scriptsMenu.addItem('Remove', () => this.removeScript(), { enabled: () => editing() && at() >= 0 });
    scriptsMenu.addItem('Up', () => this.moveScript(-1), { enabled: () => editing() && at() > 0 });
    scriptsMenu.addItem('Down', () => this.moveScript(1),
      { enabled: () => editing() && at() >= 0 && at() < this.projectPanel.ids.length - 1 });
    this.projectsMenu = this.buttonBar.add(projectsMenu);
    this.scriptsMenu = this.buttonBar.add(scriptsMenu);
    this.buttonBar.add(new Separator());
    // As in a console: Launch opens the project's scripts, run together, in
    // a Desktop or Mobile launch window.
    this.launchMenu = this.buttonBar.add(new Menu('Launch'));
    const launchable = () => this.projectPanel.ids.length > 0;
    this.launchMenu.addItem('Desktop', () => this.launch('desktop'), { enabled: launchable });
    this.launchMenu.addItem('Mobile', () => this.launch('mobile'), { enabled: launchable });
    this.buttonBar.add(new Spacer());
    this.status = this.buttonBar.add(new Label());

    this.listPanel.element.addEventListener('select', (e) => this._onSelect(e.detail.item));
    this.projectPanel.element.addEventListener('change', () => this.updateButtons());
    this.projectPanel.element.addEventListener('scriptselect', () => this.updateButtons());
    this.projectPanel.element.addEventListener('submit', () => this.save());
    // Ctrl/Cmd+S saves.
    this.element.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
    });
    // Settings > Database switched server, or Settings > User switched user:
    // show the projects of the space now in use.
    this._onSourceChange = () => { if (this.isOpen) this.refresh(); };
    document.addEventListener('cr-dbserverchange', this._onSourceChange);
    document.addEventListener('cr-userchange', this._onSourceChange);
    this.updateButtons();
  }

  /** The ids of the scripts in the project as it was last saved, in order. */
  get savedIds() { return (this.current?.scripts ?? []).map((s) => s.id); }

  /** True when the project being edited has changes that are not saved. */
  get dirty() {
    if (!this.current) return false;
    return this.projectPanel.name !== (this.current.name ?? '')
      || this.projectPanel.description !== (this.current.description ?? '')
      || !sameList(this.projectPanel.ids, this.savedIds);
  }

  open(viewport) {
    const wasOpen = this.isOpen;
    super.open(viewport);
    if (!wasOpen) this.refresh();
    return this;
  }

  /** Closing with unsaved changes asks first; the window keeps its state. */
  close() {
    if (!this._confirmDiscard()) return false;
    this.picker?.close();
    return super.close();
  }

  /**
   * Reloads the projects and the scripts from the server. The
   * project being edited is shown as it now is, unless it has unsaved
   * changes, which are kept.
   */
  async refresh() {
    const token = ++this._refreshToken;
    this.setStatus('Loading…');
    try {
      const [projects, scripts] = await Promise.all([this.store.list(), this.scriptStore.list()]);
      if (token !== this._refreshToken) return;   // a later refresh won
      this.projects = byName(projects).filter((p) => String(p.owner ?? '').trim() !== '');   // not ownerless (shared) ones
      this.scripts = scripts ?? [];
      this._suppressSelect = true;
      this.listPanel.items = this.projects.map((p) => ({ value: p.id, label: rowLabel(p) }));
      this._suppressSelect = false;

      const dirty = this.dirty;
      const fresh = this.current?.id == null ? null : this.projects.find((p) => p.id === this.current.id);
      if (this.current?.id != null && !dirty) {
        this._showProject(fresh ?? null);   // gone if it was deleted elsewhere, or is in another space
      }   // with unsaved edits, they are kept as they are
      const n = this.projects.length;
      const space = this.store.space;
      this.setStatus(`${n} project${n === 1 ? '' : 's'} · `
        + `${space == null ? '' : `${space || 'shared'} · `}${this.store.baseUrl}`);
    } catch (e) {
      this._suppressSelect = false;
      if (token === this._refreshToken) this.setStatus(e.message, 'error');
    }
    this.updateButtons();
  }

  /** Starts a new, unsaved project. */
  newProject() {
    if (!this._confirmDiscard()) return;
    this._selectId(null);
    this._showProject({ id: null, name: '', description: '', scripts: [] });
    this.projectPanel.focusName();
    this.setStatus('New project — Save to create it');
  }

  /** The space the project being edited is in: a user name, '' for shared. */
  get space() { return this.store.space ?? ''; }

  /** Opens the picker to add a script to the project: the user's own or another user's shared one. */
  addScript() {
    if (!this.current) return;
    this.picker?.close();
    const scripts = availableScripts(this.scripts, this.projectPanel.ids, this.space);
    const picker = new ScriptPickerWindow({
      scripts,
      space: this.space,
      onPick: (script) => {
        if (!this.current) return;
        this.projectPanel.addScript(script);
        this.projectPanel.list.focus();
        this.setStatus(`Added "${script.name}" — Save to keep it`);
      },
    });
    picker.element.addEventListener('close', () => { if (this.picker === picker) this.picker = null; });
    this.picker = picker;
    picker.open(this.parent);
  }

  /** Takes the selected script out of the project (the script itself is kept). */
  removeScript() {
    const script = this.projectPanel.selectedScript;
    if (!script) return;
    this.projectPanel.removeSelected();
    this.setStatus(`Removed "${script.name}" — Save to keep it`);
  }

  /**
   * Opens a launch window ('mobile' for a MobileLaunchWindow, otherwise a
   * DesktopLaunchWindow) that runs every script of the project in the list,
   * in order, on one screen - the list as it is in the window, saved or not.
   * Scripts not among those last loaded (Refresh) are skipped and reported.
   */
  launch(target) {
    const records = new Map(this.scripts.map((s) => [s.id, s]));
    const programs = [];
    let missing = 0;
    for (const id of this.projectPanel.ids) {
      const record = records.get(id);
      const language = LANGUAGES[record?.language];
      if (!record || !language) { missing += 1; continue; }
      programs.push({
        name: record.name,
        language,
        source: record.content ?? '',
        compiled: record.compiled_code ?? null,
        priority: record.priority ?? undefined,
      });
    }
    if (programs.length === 0) {
      this.setStatus(missing ? 'The scripts are not loaded: Refresh' : 'No scripts to launch', 'error');
      return null;
    }
    const Cls = target === 'mobile' ? MobileLaunchWindow : DesktopLaunchWindow;
    const title = this.projectPanel.name.trim() || 'Project';
    const win = new Cls({ title, programs }).open(this.parent);
    this.setStatus(`Launched "${title}": ${programs.length} script${programs.length === 1 ? '' : 's'}`
      + `${missing ? `, ${missing} not loaded (Refresh)` : ''}`, missing ? 'error' : undefined);
    return win;
  }

  /** Moves the selected script up (-1) or down (1) in the project. */
  moveScript(delta) {
    this.projectPanel.moveSelected(delta);
  }

  /** Creates or updates the project being edited, with the checked scripts in it. */
  async save() {
    if (!this.current) return null;
    const name = this.projectPanel.name.trim();
    if (!name) {
      this.setStatus('A name is required', 'error');
      this.projectPanel.focusName();
      return null;
    }
    const fields = { name, description: this.projectPanel.description, script_ids: this.projectPanel.ids };
    this.setStatus('Saving…');
    try {
      const saved = this.current.id == null
        ? await this.store.create(fields)
        : await this.store.update(this.current.id, fields);
      this.current = { ...saved };   // no longer dirty, so refresh shows it as saved
      this.projectPanel.name = saved.name ?? '';
      this.projectPanel.description = saved.description ?? '';
      this.projectPanel.scripts = (saved.scripts ?? []).map(projectScript);
      await this.refresh();
      this._selectId(saved.id);
      const n = (saved.scripts ?? []).length;
      this.setStatus(`Saved "${saved.name}" with ${n} script${n === 1 ? '' : 's'}`);
      return saved;
    } catch (e) {
      this.setStatus(e.message, 'error');
      return null;
    }
  }

  /** Deletes the project being edited, after asking. Its scripts are kept. */
  async deleteProject() {
    const project = this.current;
    if (!project) return;
    if (project.id == null) { this._showProject(null); this.setStatus('New project discarded'); return; }
    if (!confirm(`Delete the project "${project.name}"? Its scripts are kept.`)) return;
    this.setStatus('Deleting…');
    try {
      await this.store.remove(project.id);
      this._showProject(null);
      this._selectId(null);
      await this.refresh();
      this.setStatus(`Deleted "${project.name}"`);
    } catch (e) {
      this.setStatus(e.message, 'error');
    }
  }

  setStatus(text, tone) {
    this.status.text = text;
    this.status.tone = tone;
    this.status.element.title = text;
    this.buttonBar.layout();
  }

  updateButtons() {
    this.buttonBar.layout();
  }

  _onSelect(item) {
    if (this._suppressSelect || !item) return;
    const previous = this.current?.id ?? null;
    if (item.value === previous) return;
    if (!this._confirmDiscard()) { this._selectId(previous); return; }
    const project = this.projects.find((p) => p.id === item.value) ?? null;
    this._showProject(project);
    if (project) this.setStatus(`#${project.id} ${project.name}`);
  }

  _showProject(project) {
    this.current = project ? { ...project } : null;
    this.projectPanel.name = project?.name ?? '';
    this.projectPanel.description = project?.description ?? '';
    this.projectPanel.space = this.space;
    this.projectPanel.scripts = project ? (project.scripts ?? []).map(projectScript) : [];
    this.projectPanel.enabled = Boolean(project);
    this.projectPanel.caption = !project ? ''
      : project.id == null ? 'new project'
        : `#${project.id}${project.updated_at ? ` · updated ${formatTime(project.updated_at)}` : ''}`;
    this.updateButtons();
  }

  _confirmDiscard() {
    return !this.dirty || confirm(`Discard unsaved changes to "${this.projectPanel.name || 'new project'}"?`);
  }

  _selectId(id) {
    this._suppressSelect = true;
    try { this.listPanel.select(id == null ? -1 : this.listPanel.items.findIndex((i) => i.value === id)); }
    finally { this._suppressSelect = false; }
  }

  dispose() {
    document.removeEventListener('cr-dbserverchange', this._onSourceChange);
    document.removeEventListener('cr-userchange', this._onSourceChange);
    if (instance === this) instance = null;
    super.dispose();
  }
}

function rowLabel(project) {
  const n = (project.scripts ?? []).length;
  return `${project.name ?? ''}  (${n})`;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
