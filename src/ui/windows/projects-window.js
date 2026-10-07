// ProjectsWindow: the singleton window for the projects on the database
// server (rails/server) - the projects of the page's space listed on the
// left, the selected one edited on the right: its name, its description and
// which of the space's scripts are in it. Projects can be created, edited
// and deleted. Opened from the Views menu.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { ProjectPanel } from '../widgets/project-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { projectStore, scriptStore, byName, scriptRows, sameIds } from '../projects.js';

let instance = null;

export class ProjectsWindow extends HSplitWindow {
  /** The single ProjectsWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new ProjectsWindow();
    return instance;
  }

  /**
   * @param {object} options - Window options, plus `store` and `scripts`:
   *   the SourceStores for projects and for scripts (the page's space on
   *   the server in use, by default).
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
    this.scripts = [];     // the scripts in the space
    this.current = null;   // the project being edited; id null for a new one
    this._refreshToken = 0;
    this._suppressSelect = false;

    this.listPanel = new ListPanel({ emptyText: 'No projects' });
    this.projectPanel = new ProjectPanel();
    this.left = this.listPanel;
    this.right = this.projectPanel;

    this.newButton = this.buttonBar.addButton('New', () => this.newProject());
    this.saveButton = this.buttonBar.addButton('Save', () => this.save());
    this.deleteButton = this.buttonBar.addButton('Delete', () => this.deleteProject());
    this.buttonBar.addButton('Refresh', () => this.refresh());
    this.buttonBar.add(new Spacer());
    this.status = this.buttonBar.add(new Label());

    this.listPanel.element.addEventListener('select', (e) => this._onSelect(e.detail.item));
    this.projectPanel.element.addEventListener('change', () => this.updateButtons());
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

  /** The ids of the scripts in the project as it was last saved. */
  get savedIds() { return (this.current?.scripts ?? []).map((s) => s.id); }

  /** True when the project being edited has changes that are not saved. */
  get dirty() {
    if (!this.current) return false;
    return this.projectPanel.name !== (this.current.name ?? '')
      || this.projectPanel.description !== (this.current.description ?? '')
      || !sameIds(this.projectPanel.checkedIds, this.savedIds);
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
    return super.close();
  }

  /**
   * Reloads the projects and the scripts of the space from the server. The
   * project being edited is shown as it now is, unless it has unsaved
   * changes, which are kept.
   */
  async refresh() {
    const token = ++this._refreshToken;
    this.setStatus('Loading…');
    try {
      const [projects, scripts] = await Promise.all([this.store.list(), this.scriptStore.list()]);
      if (token !== this._refreshToken) return;   // a later refresh won
      this.projects = byName(projects);
      this.scripts = scripts ?? [];
      this._suppressSelect = true;
      this.listPanel.items = this.projects.map((p) => ({ value: p.id, label: rowLabel(p) }));
      this._suppressSelect = false;

      const dirty = this.dirty;
      const fresh = this.current?.id == null ? null : this.projects.find((p) => p.id === this.current.id);
      if (this.current?.id != null && !dirty) {
        this._showProject(fresh ?? null);   // gone if it was deleted elsewhere, or is in another space
      } else if (this.current) {
        // Unsaved edits: keep them, over the scripts there are now.
        const checked = this.projectPanel.checkedIds;
        this.projectPanel.rows = scriptRows(this.scripts, this.current);
        this.projectPanel.checkedIds = checked;
      }
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

  /** Creates or updates the project being edited, with the checked scripts in it. */
  async save() {
    if (!this.current) return null;
    const name = this.projectPanel.name.trim();
    if (!name) {
      this.setStatus('A name is required', 'error');
      this.projectPanel.focusName();
      return null;
    }
    const fields = { name, description: this.projectPanel.description, script_ids: this.projectPanel.checkedIds };
    this.setStatus('Saving…');
    try {
      const saved = this.current.id == null
        ? await this.store.create(fields)
        : await this.store.update(this.current.id, fields);
      this.current = { ...saved };   // no longer dirty, so refresh shows it as saved
      this.projectPanel.name = saved.name ?? '';
      this.projectPanel.description = saved.description ?? '';
      this.projectPanel.checkedIds = (saved.scripts ?? []).map((s) => s.id);
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
    if (!confirm(`Delete the project "${project.name}"? Its scripts are kept, in no project.`)) return;
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
    const editing = Boolean(this.current);
    this.saveButton.enabled = editing && (this.dirty || this.current.id == null);
    this.deleteButton.enabled = editing;
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
    this.projectPanel.rows = project ? scriptRows(this.scripts, project) : [];
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
