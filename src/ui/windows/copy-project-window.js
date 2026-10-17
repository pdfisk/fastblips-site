// CopyProjectWindow: the dialog opened by the Community Projects window's Copy
// button. It names the project being copied and has a Name field, which can
// be edited before the copy is stored as a project of the signed-in user in
// My Projects (with copies of its scripts: see copyProject in projects.js).
// It is not a singleton: it closes itself once the copy is made.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { Toast } from '../toast.js';
import { installStyle } from './sign-in-window.js';
import { projectStore, scriptStore, copyProject, uniqueName } from '../projects.js';
import { spaceName } from '../db-client.js';

/** The form: what is being copied, a Name field and an error line. */
class CopyProjectPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-sign-in');
    this.status = document.createElement('div');
    this.status.className = 'cr-sign-in-status';
    const row = document.createElement('div');
    row.className = 'cr-sign-in-row';
    const label = document.createElement('label');
    label.textContent = 'Name';
    this.nameInput = document.createElement('input');
    this.nameInput.className = 'cr-sign-in-name';
    this.nameInput.spellcheck = false;
    label.htmlFor = this.nameInput.id = `cr-copy-project-name-${Math.random().toString(36).slice(2)}`;
    row.append(label, this.nameInput);
    this.error = document.createElement('div');
    this.error.className = 'cr-sign-in-error';
    this.error.setAttribute('role', 'alert');
    this.element.append(this.status, row, this.error);
  }
}

export class CopyProjectWindow extends Window {
  /**
   * @param {object} options
   * @param {object} options.project - the project to copy, with its scripts' snapshots
   * @param {(result: {project: object, renamed: object[]}) => void} [options.onCopied] - called after the copy is stored
   * @param {object} [options.projects] - the store for the target space's projects (tests); My Projects by default
   * @param {object} [options.scripts] - the store for the target space's scripts, in every language (tests)
   */
  constructor({ project, onCopied, projects, scripts } = {}) {
    if (!project) throw new TypeError('CopyProjectWindow needs a project');
    super({ title: 'Copy Project', x: 140, y: 100, width: 380, height: 160, resizable: false });
    this.element.classList.add('cr-sign-in-window');
    this.source = project;
    this.onCopied = onCopied;
    this.projects = projects ?? projectStore();
    this.scripts = scripts ?? scriptStore().inSpace(spaceName());
    this.busy = false;   // waiting for the server
    this.panel = new CopyProjectPanel();
    this.content = this.panel;
    const n = (project.scripts ?? []).length;
    const owner = project.owner ? ` by ${project.owner}` : '';
    this.panel.status.textContent = `Copy "${project.name}"${owner} (${n} script${n === 1 ? '' : 's'}) to My Projects`;
    this.panel.nameInput.value = project.name ?? '';
    this.panel.nameInput.maxLength = 100;
    this.copyButton = this.buttonBar.addButton('Copy', () => this.copy());
    this.buttonBar.addButton('Cancel', () => this.close());

    const input = this.panel.nameInput;
    input.addEventListener('input', () => { this.panel.error.textContent = ''; this.updateButtons(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.copy(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.updateButtons();
  }

  /** The name typed in the field, trimmed. */
  get name() { return this.panel.nameInput.value.trim(); }

  updateButtons() {
    this.copyButton.enabled = this.name !== '' && !this.busy;
    this.buttonBar.layout();
  }

  /**
   * Stores the copy under the name in the field, then closes and shows a
   * toast. A name that is already one of the user's projects, or a server
   * that cannot be reached, is reported in the window instead.
   * @returns {Promise<object|null>} the new project, or null if it was not made
   */
  async copy() {
    const name = this.name;
    if (!name || this.busy) return null;
    this.busy = true;
    this.panel.error.textContent = '';
    this.updateButtons();
    let result;
    try {
      result = await copyProject(this.source, { name, projects: this.projects, scripts: this.scripts });
    } catch (e) {
      this.busy = false;
      this.panel.error.textContent = e?.message || 'Could not copy the project';
      this.updateButtons();
      this.panel.nameInput.focus();
      return null;
    }
    this.busy = false;
    const viewport = this.parent;
    const wasOpen = this.isOpen;
    if (wasOpen) this.close();
    document.dispatchEvent(new CustomEvent('cr-projectscopied', { detail: { project: result.project } }));
    this.onCopied?.(result);
    if (viewport) {
      const { renamed } = result;
      Toast.show(viewport, {
        kind: 'success',
        message: `Copied to My Projects as "${result.project.name}"`
          + (renamed.length ? `; renamed ${renamed.length} script${renamed.length === 1 ? '' : 's'} that you already had` : ''),
      });
    }
    return result.project;
  }

  /** Opens the window with the name selected; the name is made free if the user already has a project called that. */
  open(viewport) {
    super.open(viewport);
    this.panel.nameInput.focus();
    this.panel.nameInput.select();
    this._suggest();
    return this;
  }

  // Replaces the name with a free one (Name 2...) if it is taken and has not been edited.
  async _suggest() {
    const original = this.panel.nameInput.value;
    try {
      const free = uniqueName(original, (await this.projects.list()).map((p) => p.name));
      if (free !== original && this.isOpen && this.panel.nameInput.value === original) {
        this.panel.nameInput.value = free;
        this.panel.nameInput.select();
        this.updateButtons();
      }
    } catch { /* copy() reports a server that cannot be reached */ }
  }
}
