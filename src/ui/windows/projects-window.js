// ProjectsWindow: the singleton window for the projects on the database
// server (rails/server) - the projects of the page's space listed on the
// left (only those with an owner), the selected one edited on the right:
// its name, its description and its scripts, in order. A project keeps its
// own copy of each script's source: Add copies a script into it, chosen from
// the user's own and those in the shared space; Edit opens the project's copy
// of the selected one in an edit window, whose Save changes that copy and
// saves the project (the script it was copied from is left as it was);
// Remove takes it out; Up and Down move it. Projects can be created, edited
// and deleted. With a project selected, the Category button shows and
// chooses the project's category (Development, Desktop Game, Desktop App,
// Mobile Game or Mobile App), which Save stores with it; with none selected,
// it filters the list to the projects of one category (All shows them all).
// Refresh leaves no project and no category selected. Opened from the
// Navbar's My Projects button.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { ProjectPanel } from '../widgets/project-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { Menu } from '../widgets/menu.js';
import { Separator } from '../widgets/separator.js';
import { ScriptPickerWindow } from './script-picker-window.js';
import { ScriptEditWindow } from './script-edit-window.js';
import { DesktopLaunchWindow, MobileLaunchWindow, addLaunchItems, launchWeb } from './launch-window.js';
import { PythonConsoleWindow } from './python-console-window.js';
import {
  projectStore, scriptStore, byName, availableScripts, projectScriptCopy, findProjectScript, projectPrograms, sameScripts,
  PROJECT_CATEGORIES, DEFAULT_PROJECT_CATEGORY, projectCategory, projectCategoryLabel,
} from '../projects.js';

// The console class that compiles and runs a script, by the language it is saved with.
const LANGUAGES = { python: PythonConsoleWindow };

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
   *   by default) and for scripts (every space: Add copies one of the
   *   user's own or one in the shared space into the project).
   */
  constructor({ store, scripts, ...options } = {}) {
    super({
      title: 'My Projects',
      x: 170, y: 110, width: 700, height: 440,
      minWidth: 440, minHeight: 280, position: 0.3,
      ...options,
    });
    instance ??= this;
    this.element.classList.add('cr-projects-window');
    this.store = store ?? projectStore();
    this.scriptStore = scripts ?? scriptStore();
    this.projects = [];    // the projects in the space, by name
    this.scripts = [];     // the script records in every space, to copy from
    this.picker = null;    // the open ScriptPickerWindow, if any
    this.editors = new Map();   // the open ScriptEditWindows, by the key of the project script
    this.current = null;   // the project being edited; id null for a new one
    this.category = DEFAULT_PROJECT_CATEGORY;   // the category chosen for it, which Save stores
    this.filter = null;    // with no project selected: the category the list shows (null: all)
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
    projectsMenu.addItem('Refresh', () => { if (this._confirmDiscard()) this.refresh({ clear: true }); });
    const scriptsMenu = new Menu('Scripts');
    const selected = () => editing() && at() >= 0;
    scriptsMenu.addItem('Edit', () => this.editScript(), { enabled: selected });
    scriptsMenu.addSeparator();
    scriptsMenu.addItem('Add', () => this.addScript(), { enabled: editing });
    scriptsMenu.addItem('Remove', () => this.removeScript(), { enabled: selected });
    scriptsMenu.addSeparator();
    scriptsMenu.addItem('Up', () => this.moveScript(-1), { enabled: () => editing() && at() > 0 });
    scriptsMenu.addItem('Down', () => this.moveScript(1),
      { enabled: () => editing() && at() >= 0 && at() < this.projectPanel.names.length - 1 });
    this.projectsMenu = this.buttonBar.add(projectsMenu);
    this.scriptsMenu = this.buttonBar.add(scriptsMenu);
    // Category: with a project, what kind of project it is; with none, which
    // projects the list shows. Its label shows the one chosen.
    this.categoryMenu = this.buttonBar.add(new Menu('Category'));
    this.categoryMenu.addItem('All', () => this.setFilter(null),
      { checked: () => !editing() && this.filter == null, enabled: () => !editing() });
    this.categoryMenu.addSeparator();
    for (const { value, label } of PROJECT_CATEGORIES) {
      this.categoryMenu.addItem(label, () => (editing() ? this.setCategory(value) : this.setFilter(value)),
        { checked: () => (editing() ? this.category === value : this.filter === value) });
    }
    this.buttonBar.add(new Separator());
    // As in a console: Launch runs the project's scripts together, in a
    // Desktop or Mobile launch window or, for the saved project, as a web page.
    this.launchMenu = this.buttonBar.add(new Menu('Launch'));
    addLaunchItems(this.launchMenu, (target) => this.launch(target),
      (target) => (target === 'web' ? this.savedScripts.length > 0 && this.current?.id != null : this.projectPanel.names.length > 0));
    this.buttonBar.add(new Spacer());
    this.status = this.buttonBar.add(new Label());

    this.listPanel.element.addEventListener('select', (e) => this._onSelect(e.detail.index, e.detail.item));
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
    // A project was copied here from Shared Projects.
    document.addEventListener('cr-projectscopied', this._onSourceChange);
    this.updateButtons();
  }

  /** The scripts of the project as it was last saved, in order. */
  get savedScripts() { return [...(this.current?.scripts ?? [])]; }

  /** True when the project being edited has changes that are not saved. */
  get dirty() {
    if (!this.current) return false;
    return this.projectPanel.name !== (this.current.name ?? '')
      || this.projectPanel.description !== (this.current.description ?? '')
      || this.projectPanel.shared !== Boolean(this.current.shared)
      || this.category !== projectCategory(this.current)
      || !sameScripts(this.projectPanel.copies, this.savedScripts);
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
    for (const editor of this.editors.values()) editor.close();
    return super.close();
  }

  /**
   * Reloads the projects and the scripts from the server. The
   * project being edited is shown as it now is, unless it has unsaved
   * changes, which are kept. With `clear`, no project is left selected
   * (the Refresh command, which first asks about unsaved changes).
   */
  async refresh({ clear = false } = {}) {
    const token = ++this._refreshToken;
    this.setStatus('Loading…');
    try {
      const [projects, scripts] = await Promise.all([this.store.list(), this.scriptStore.list()]);
      if (token !== this._refreshToken) return;   // a later refresh won
      this.projects = byName(projects).filter((p) => String(p.owner ?? '').trim() !== '');   // not ownerless (shared) ones
      this.scripts = scripts ?? [];
      // Refresh starts with no project and no category selected.
      if (clear) { this.filter = null; this._showProject(null); }
      this._fillList();
      if (clear) this._selectId(null);
      const dirty = this.dirty;
      const fresh = this.current?.id == null ? null : this.projects.find((p) => p.id === this.current.id);
      if (this.current?.id != null && !dirty) {
        this._showProject(fresh ?? null);   // gone if it was deleted elsewhere, or is in another space
      }   // with unsaved edits, they are kept as they are
      this._showCount();
    } catch (e) {
      this._suppressSelect = false;
      if (token === this._refreshToken) this.setStatus(e.message, 'error');
    }
    this.updateButtons();
  }

  /** Starts a new, unsaved project, in the category the list shows, if any. */
  newProject() {
    if (!this._confirmDiscard()) return;
    this._selectId(null);
    this._showProject({ id: null, name: '', description: '', shared: false, category: this.filter ?? DEFAULT_PROJECT_CATEGORY, scripts: [] });
    this.projectPanel.focusName();
    this.setStatus('New project — Save to create it');
  }

  /** Chooses the project's category; Save stores it. */
  setCategory(value) {
    if (!this.current) return;
    this.category = value;
    this.updateButtons();
    if (this.dirty) this.setStatus(`Category ${projectCategoryLabel(value)} — Save to keep it`);
  }

  /** With no project selected: shows only the projects of one category (null: all of them). */
  setFilter(category) {
    if (this.current) return;
    this.filter = category;
    this._fillList();
    this._selectId(null);
    this._showCount();
    this.updateButtons();
  }

  /** The list on the left: the projects of the category chosen, or all of them. */
  _fillList() {
    const shown = this.projects.filter((p) => this.filter == null || projectCategory(p) === this.filter);
    this._suppressSelect = true;
    try { this.listPanel.items = shown.map((p) => ({ value: p.id, label: rowLabel(p) })); }
    finally { this._suppressSelect = false; }
  }

  /** The status: how many projects are listed, in which space and on which server. */
  _showCount() {
    const total = this.projects.length;
    const n = this.listPanel.items.length;
    const count = this.filter == null
      ? `${total} project${total === 1 ? '' : 's'}`
      : `${n} of ${total} project${total === 1 ? '' : 's'} (${projectCategoryLabel(this.filter)})`;
    const space = this.store.space;
    this.setStatus(`${count} · ${space == null ? '' : `${space || 'shared'} · `}${this.store.baseUrl}`);
  }

  /** The space the project being edited is in: a user name, '' for shared. */
  get space() { return this.store.space ?? ''; }

  /** Opens the picker to copy a script into the project: the user's own or one in the shared space. */
  addScript() {
    if (!this.current) return;
    this.picker?.close();
    const scripts = availableScripts(this.scripts, this.projectPanel.names, this.space);
    const picker = new ScriptPickerWindow({
      scripts,
      space: this.space,
      onPick: (script) => {
        if (!this.current) return;
        const record = this.scripts.find((s) => s.id === script.id);
        if (!record) return;
        this.projectPanel.addScript(projectScriptCopy(record));
        this.projectPanel.list.focus();
        this.setStatus(`Added a copy of "${record.name}" — Save to keep it`);
      },
    });
    picker.element.addEventListener('close', () => { if (this.picker === picker) this.picker = null; });
    this.picker = picker;
    picker.open(this.parent);
  }

  /**
   * Opens the project's copy of the selected script in an edit window (one
   * per script). Its Save changes the copy and saves the project.
   */
  editScript() {
    const script = this.projectPanel.selectedScript;
    if (!script) return null;
    const { key } = script;
    const open = this.editors.get(key);
    if (open) return open.open(this.parent);
    const editor = new ScriptEditWindow({
      store: this._scriptCopyStore(key),
      id: key,
      name: script.name,
      language: script.language,
      onSave: (saved) => this.setStatus(`Saved "${saved.name}" in "${this.current?.name ?? ''}"`),
    });
    editor.element.addEventListener('close', () => { if (this.editors.get(key) === editor) this.editors.delete(key); });
    this.editors.set(key, editor);
    return editor.open(this.parent);
  }

  // The store a ScriptEditWindow edits the project script with key through:
  // get reads it from the list; update changes it there, then saves the project.
  _scriptCopyStore(key) {
    const read = () => {
      const script = this.projectPanel.scriptByKey(key);
      if (!script) throw new Error('This script is no longer in the project');
      return { name: script.name, language: script.language, content: script.content };
    };
    return {
      get: async () => read(),
      update: async (_id, fields) => {
        const name = String(fields.name ?? '').trim();
        const other = findProjectScript(name, this.projectPanel.scripts.filter((s) => s.key !== key));
        if (other) throw new Error(`The project already has a script called "${other.name}"`);
        read();
        this.projectPanel.updateScript(key, fields);
        const saved = await this.save();
        if (!saved) throw new Error(this.status.text || 'The project was not saved');
        return read();
      },
    };
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
   * Scripts in a language that cannot run are skipped and reported.
   * 'web' instead opens the project as it was last saved as a full page in a
   * new browser tab (?project=), and returns the address; a project that has
   * not been saved has none (null, with a message in the status line).
   */
  launch(target) {
    if (target === 'web') {
      const name = this.current?.id == null ? '' : String(this.current.name ?? '').trim();
      if (!name || this.savedScripts.length === 0) {
        this.setStatus('Save the project first: Web runs the saved project', 'error');
        return null;
      }
      return launchWeb(name, this.current.owner ?? this.space, { project: true });
    }
    const { programs, skipped } = projectPrograms(this.projectPanel.copies, LANGUAGES);
    if (programs.length === 0) {
      this.setStatus('No scripts to launch', 'error');
      return null;
    }
    const Cls = target === 'mobile' ? MobileLaunchWindow : DesktopLaunchWindow;
    const title = this.projectPanel.name.trim() || 'Project';
    const win = new Cls({ title, programs }).open(this.parent);
    this.setStatus(`Launched "${title}": ${programs.length} script${programs.length === 1 ? '' : 's'}`
      + `${skipped ? `, ${skipped} in a language that cannot run` : ''}`, skipped ? 'error' : undefined);
    return win;
  }

  /** Moves the selected script up (-1) or down (1) in the project. */
  moveScript(delta) {
    this.projectPanel.moveSelected(delta);
  }

  /** Creates or updates the project being edited, with the copies of its scripts in the list. */
  async save() {
    if (!this.current) return null;
    const name = this.projectPanel.name.trim();
    if (!name) {
      this.setStatus('A name is required', 'error');
      this.projectPanel.focusName();
      return null;
    }
    const fields = {
      name, description: this.projectPanel.description, shared: this.projectPanel.shared,
      category: this.category, scripts: this.projectPanel.copies,
    };
    this.setStatus('Saving…');
    try {
      const saved = this.current.id == null
        ? await this.store.create(fields)
        : await this.store.update(this.current.id, fields);
      this.current = { ...saved };   // no longer dirty, so refresh shows it as saved
      this.projectPanel.name = saved.name ?? '';
      this.projectPanel.description = saved.description ?? '';
      this.projectPanel.shared = Boolean(saved.shared);
      this.category = projectCategory(saved);
      this.projectPanel.scripts = saved.scripts ?? [];
      // Saved in another category than the list shows: show them all, so it stays listed.
      if (this.filter != null && this.category !== this.filter) this.filter = null;
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

  /** Deletes the project being edited, with its copies of its scripts, after asking. */
  async deleteProject() {
    const project = this.current;
    if (!project) return;
    if (project.id == null) { this._showProject(null); this.setStatus('New project discarded'); return; }
    if (!confirm(`Delete the project "${project.name}" and its copies of its scripts?`)) return;
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
    // The Category button names the project's category or, with no project
    // selected, the category the list is filtered to (none: just Category).
    const shown = this.current ? this.category : this.filter;
    this.categoryMenu.label = shown == null ? 'Category' : `Category: ${projectCategoryLabel(shown)}`;
    this.categoryMenu.button.disabled = false;
    // The title names it too: "My Projects: Desktop Game".
    this.title = shown == null ? 'My Projects' : `My Projects: ${projectCategoryLabel(shown)}`;
    this.buttonBar.layout();
  }

  _onSelect(index, item) {
    if (this._suppressSelect || !item) return;
     const previous = this.current?.id ?? null;
    if (item.value === previous) return;
    if (!this._confirmDiscard()) { this._selectId(previous); return; }
    const project = this.projects.find((p) => p.id === item.value) ?? null;
    this._showProject(project);
    this.projectPanel.selectIndex(index);
   if (project) this.setStatus(`#${project.id} ${project.name}`);
  }

  _showProject(project) {
    // The edit windows are for the scripts of the project shown until now.
    if ((project?.id ?? null) !== (this.current?.id ?? null) || !project) {
      for (const editor of [...this.editors.values()]) editor.close();
    }
    this.current = project ? { ...project } : null;
    this.projectPanel.name = project?.name ?? '';
    this.projectPanel.description = project?.description ?? '';
    this.projectPanel.shared = Boolean(project?.shared);
    this.category = projectCategory(project);
    this.projectPanel.space = this.space;
    this.projectPanel.scripts = project ? (project.scripts ?? []) : [];
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
    document.removeEventListener('cr-projectscopied', this._onSourceChange);
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
