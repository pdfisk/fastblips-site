// ProjectPanel: the editor for one project - a Name field and a caption
// along the top, a Description, and a check list of the scripts that can be
// in the project (see docs/widgets.txt). Used by ProjectsWindow.

import { Panel } from './panel.js';

const STYLE = `
.cr-project-form{position:absolute;inset:0;display:flex;flex-direction:column;
  background:var(--cr-window-bg);color:var(--cr-text)}
.cr-project-header{flex:none;height:32px;box-sizing:border-box;display:flex;align-items:center;gap:6px;
  padding:0 8px;background:var(--cr-header-bg);border-bottom:1px solid var(--cr-divider)}
.cr-project-header label,.cr-project-heading{color:var(--cr-header-text)}
.cr-project-name,.cr-project-description{box-sizing:border-box;padding:0 6px;
  border:1px solid var(--cr-field-border);border-radius:var(--cr-radius-field);
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-code)}
.cr-project-name{flex:1;min-width:60px;height:22px}
.cr-project-name:disabled,.cr-project-description:disabled{background:var(--cr-field-disabled-bg)}
.cr-project-info{color:var(--cr-header-info);font-size:var(--cr-font-size-small);white-space:nowrap}
.cr-project-section{flex:none;display:flex;flex-direction:column;gap:4px;padding:8px 8px 0}
.cr-project-heading{display:flex;align-items:baseline;gap:8px}
.cr-project-count{color:var(--cr-text-muted);font-size:var(--cr-font-size-small)}
.cr-project-description{height:58px;padding:4px 6px;resize:none;line-height:1.4}
.cr-project-scripts{flex:1;min-height:0;overflow:auto;margin:4px 8px 8px;padding:2px 0;list-style:none;
  box-sizing:border-box;border:1px solid var(--cr-field-border);border-radius:var(--cr-radius-field);
  background:var(--cr-input-bg);font:var(--cr-font-size)/1.4 var(--cr-font-code)}
.cr-project-scripts label{display:flex;align-items:center;gap:6px;padding:2px 8px;white-space:nowrap;cursor:default}
.cr-project-scripts label:hover{background:var(--cr-list-selected)}
.cr-project-scripts input{margin:0;flex:none}
.cr-project-script-name{overflow:hidden;text-overflow:ellipsis}
.cr-project-script-language,.cr-project-script-note{color:var(--cr-text-muted);font-size:var(--cr-font-size-small)}
.cr-project-empty{color:var(--cr-text-faint);padding:6px 8px}
`;

function installStyle() {
  if (document.getElementById('cr-project-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-project-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2)}`;

export class ProjectPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-project-panel');
    this._rows = [];
    this._enabled = false;

    const form = document.createElement('div');
    form.className = 'cr-project-form';

    const header = document.createElement('div');
    header.className = 'cr-project-header';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    this.nameInput = document.createElement('input');
    this.nameInput.className = 'cr-project-name';
    this.nameInput.spellcheck = false;
    nameLabel.htmlFor = this.nameInput.id = uid('cr-project-name');
    this.info = document.createElement('span');
    this.info.className = 'cr-project-info';
    header.append(nameLabel, this.nameInput, this.info);

    const about = document.createElement('div');
    about.className = 'cr-project-section';
    const aboutLabel = document.createElement('label');
    aboutLabel.className = 'cr-project-heading';
    aboutLabel.textContent = 'Description';
    this.descriptionInput = document.createElement('textarea');
    this.descriptionInput.className = 'cr-project-description';
    aboutLabel.htmlFor = this.descriptionInput.id = uid('cr-project-description');
    about.append(aboutLabel, this.descriptionInput);

    const scripts = document.createElement('div');
    scripts.className = 'cr-project-section';
    const heading = document.createElement('div');
    heading.className = 'cr-project-heading';
    heading.id = uid('cr-project-scripts');
    const title = document.createElement('span');
    title.textContent = 'Scripts';
    this.count = document.createElement('span');
    this.count.className = 'cr-project-count';
    heading.append(title, this.count);
    scripts.append(heading);

    this.list = document.createElement('ul');
    this.list.className = 'cr-project-scripts';
    this.list.setAttribute('role', 'group');
    this.list.setAttribute('aria-labelledby', heading.id);

    form.append(header, about, scripts, this.list);
    this.element.appendChild(form);

    // One 'change' event for an edit to any field.
    const changed = () => this.element.dispatchEvent(new CustomEvent('change'));
    this.nameInput.addEventListener('input', changed);
    this.descriptionInput.addEventListener('input', changed);
    this.list.addEventListener('change', () => { this._count(); changed(); });
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.element.dispatchEvent(new CustomEvent('submit')); }
    });
    this.descriptionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.element.dispatchEvent(new CustomEvent('submit'));
      }
    });
    this.enabled = false;
    this._render();
  }

  get name() { return this.nameInput.value; }
  set name(value) { this.nameInput.value = value ?? ''; }

  get description() { return this.descriptionInput.value; }
  set description(value) { this.descriptionInput.value = value ?? ''; }

  /** Caption shown to the right of the name, e.g. '#3 · updated 10:42'. */
  set caption(text) { this.info.textContent = text; }

  /**
   * The script list: [{ id, name, language, checked, note }] (scriptRows in
   * ../projects.js). Setting it replaces the rows and their check marks.
   */
  get rows() { return this._rows.map((row) => ({ ...row })); }
  set rows(rows) {
    this._rows = (rows ?? []).map((row) => ({ ...row }));
    this._render();
  }

  /** The ids of the checked scripts, in list order. */
  get checkedIds() {
    return [...this.list.querySelectorAll('input:checked')].map((box) => Number(box.value));
  }
  set checkedIds(ids) {
    const wanted = new Set(ids);
    for (const box of this.list.querySelectorAll('input')) box.checked = wanted.has(Number(box.value));
    this._count();
  }

  /** A disabled panel shows its fields but they cannot be edited. */
  get enabled() { return this._enabled; }
  set enabled(value) {
    this._enabled = Boolean(value);
    this.nameInput.disabled = !this._enabled;
    this.descriptionInput.disabled = !this._enabled;
    for (const box of this.list.querySelectorAll('input')) box.disabled = !this._enabled;
  }

  focusName() { this.nameInput.focus(); this.nameInput.select(); }

  /** A ProjectPanel holds only its own fields. */
  add() { throw new Error('ProjectPanel cannot contain other widgets'); }

  _render() {
    this.list.replaceChildren(...this._rows.map((row) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = String(row.id);
      box.checked = Boolean(row.checked);
      box.disabled = !this._enabled;
      const name = document.createElement('span');
      name.className = 'cr-project-script-name';
      name.textContent = row.name;
      const language = document.createElement('span');
      language.className = 'cr-project-script-language';
      language.textContent = row.language;
      label.append(box, name, language);
      if (row.note) {
        const note = document.createElement('span');
        note.className = 'cr-project-script-note';
        note.textContent = `· ${row.note}`;
        label.append(note);
      }
      li.append(label);
      return li;
    }));
    if (this._rows.length === 0) {
      const li = document.createElement('li');
      li.className = 'cr-project-empty';
      li.textContent = 'No scripts in this space';
      this.list.appendChild(li);
    }
    this._count();
  }

  _count() {
    const n = this.list.querySelectorAll('input:checked').length;
    this.count.textContent = this._rows.length ? `${n} of ${this._rows.length} in this project` : '';
  }
}
