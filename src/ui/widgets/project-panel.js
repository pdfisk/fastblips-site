// ProjectPanel: the editor for one project - a Name field and a caption
// along the top, a Description, and below them a tabbed container: Scripts,
// the ordered list of the scripts in the project, one of which can be
// selected, then Strings and Images (see docs/widgets.txt). Used by
// ProjectsWindow.

import { Panel } from './panel.js';
import { TabPanel } from './tab-panel.js';
import { scriptLabel, moved } from '../projects.js';

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
.cr-project-description{height:58px;padding:4px 6px;resize:none;line-height:1.4}
.cr-project-tabs{flex:1;min-height:0;position:relative;margin:8px 8px 8px}
.cr-project-page{overflow:hidden}
.cr-project-scripts{position:absolute;inset:4px 0 0;overflow:auto;margin:0;padding:2px 0;list-style:none;
  box-sizing:border-box;border:1px solid var(--cr-field-border);border-radius:var(--cr-radius-field);
  background:var(--cr-input-bg);font:var(--cr-font-size)/1.4 var(--cr-font-code)}
.cr-project-scripts:focus{outline:0;border-color:var(--cr-list-selected-focus)}
.cr-project-scripts li[data-index]{padding:2px 8px;white-space:pre;cursor:default;overflow:hidden;text-overflow:ellipsis}
.cr-project-scripts li[aria-selected="true"]{background:var(--cr-list-selected)}
.cr-project-scripts:focus li[aria-selected="true"]{background:var(--cr-list-selected-focus);color:var(--cr-list-selected-focus-text)}
.cr-project-empty{color:var(--cr-text-faint);padding:6px 8px}
`;

function installStyle() {
  if (document.getElementById('cr-project-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-project-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

// A page of the tabbed container: a plain panel holding DOM of its own.
class Page extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-project-page');
  }
}

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2)}`;

export class ProjectPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-project-panel');
    this._scripts = [];      // [{ id, name, language, owner, shared }], in order
    this._selectedId = null;
    this._space = '';
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

    this.list = document.createElement('ul');
    this.list.className = 'cr-project-scripts';
    this.list.tabIndex = 0;
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Scripts');

    // Scripts, Strings and Images pages under tabs. The tabs are a child
    // widget of this panel whose element sits in tabsBox.
    this.tabs = new TabPanel();
    const scriptsPage = new Page();
    scriptsPage.element.appendChild(this.list);
    this.tabs.addTab('Scripts', scriptsPage);
    for (const [label, empty] of [['Strings', 'No strings'], ['Images', 'No images']]) {
      const page = new Page();
      const note = document.createElement('div');
      note.className = 'cr-project-empty';
      note.textContent = empty;
      page.element.appendChild(note);
      this.tabs.addTab(label, page);
    }
    this.tabsBox = document.createElement('div');
    this.tabsBox.className = 'cr-project-tabs';
    this.tabsBox.appendChild(this.tabs.element);
    this.tabs.parent = this;
    this._children.push(this.tabs);

    form.append(header, about, this.tabsBox);
    this.element.appendChild(form);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.layout()).observe(this.tabsBox);

    // One 'change' event for an edit to any field.
    const changed = () => this.element.dispatchEvent(new CustomEvent('change'));
    this.nameInput.addEventListener('input', changed);
    this.descriptionInput.addEventListener('input', changed);
    this.list.addEventListener('mousedown', (e) => {
      const row = e.target.closest('li[data-index]');
      if (row) this.selectIndex(Number(row.dataset.index));
    });
    this.list.addEventListener('keydown', (e) => {
      const n = this._scripts.length;
      const next = {
        ArrowDown: Math.min(n - 1, this.selectedIndex + 1), ArrowUp: Math.max(0, this.selectedIndex - 1),
        Home: 0, End: n - 1
      }[e.key];
      if (n === 0 || next === undefined) return;
      e.preventDefault();
      this.selectIndex(next);
    });
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
   * The scripts in the project, in order: [{ id, name, language, owner,
   * shared }] (see projectScript in ../projects.js). Setting it replaces the
   * list, keeping the selection if that script is still in it.
   */
  get scripts() { return this._scripts.map((script) => ({ ...script })); }
  set scripts(scripts) {
    this._scripts = (scripts ?? []).map((script) => ({ ...script }));
    if (!this._scripts.some((script) => script.id === this._selectedId)) this._selectedId = null;
    this._render();
  }

  /** The ids of the scripts, in order. */
  get ids() { return this._scripts.map((script) => script.id); }

  /** The space the project is in; scripts of other users show their owner. */
  get space() { return this._space; }
  set space(value) { this._space = value ?? ''; this._render(); }

  /** Index of the selected script, -1 for none. */
  get selectedIndex() { return this._scripts.findIndex((script) => script.id === this._selectedId); }
  get selectedScript() { return this._scripts[this.selectedIndex] ?? null; }

  /** Selects the script at index (-1 for none); fires scriptselect. */
  selectIndex(index) {
    const script = this._scripts[index];
    const id = script ? script.id : null;
    if (id === this._selectedId) return;
    this._selectedId = id;
    this._render();
    this.element.dispatchEvent(new CustomEvent('scriptselect', { detail: { index, script: script ?? null } }));
  }

  /** Adds a script at the end of the list and selects it. A script already in it is just selected. */
  addScript(script) {
    const at = this._scripts.findIndex((s) => s.id === script.id);
    if (at < 0) {
      this._scripts.push({ ...script });
      this._selectedId = null;   // so the selection is reported
      this._render();
      this.selectIndex(this._scripts.length - 1);
      this._changed();
    } else {
      this.selectIndex(at);
    }
  }

  /** Takes the selected script out of the list; the one that takes its place is selected. */
  removeSelected() {
    const at = this.selectedIndex;
    if (at < 0) return;
    this._scripts.splice(at, 1);
    this._selectedId = null;
    this._render();
    this.selectIndex(Math.min(at, this._scripts.length - 1));
    this._changed();
  }

  /** Moves the selected script up (-1) or down (1) the list. */
  moveSelected(delta) {
    const at = this.selectedIndex;
    const to = at + delta;
    if (at < 0 || to < 0 || to >= this._scripts.length) return;
    this._scripts = moved(this._scripts, at, delta);
    this._render();
    this.list.children[to]?.scrollIntoView?.({ block: 'nearest' });
    this._changed();
    this.element.dispatchEvent(new CustomEvent('scriptselect', { detail: { index: to, script: this._scripts[to] } }));
  }

  /** A disabled panel shows its fields but they cannot be edited. */
  get enabled() { return this._enabled; }
  set enabled(value) {
    this._enabled = Boolean(value);
    this.nameInput.disabled = !this._enabled;
    this.descriptionInput.disabled = !this._enabled;
    this.list.setAttribute('aria-disabled', String(!this._enabled));
  }

  focusName() { this.nameInput.focus(); this.nameInput.select(); }

  /** Fits the tabbed container to the room left under the description. */
  layout() {
    this.tabs.setBounds(0, 0, this.tabsBox.clientWidth, this.tabsBox.clientHeight);
    super.layout();
  }

  /** A ProjectPanel holds only its own fields. */
  add() { throw new Error('ProjectPanel cannot contain other widgets'); }

  _changed() { this.element.dispatchEvent(new CustomEvent('change')); }

  _render() {
    const selected = this.selectedIndex;
    this.list.replaceChildren(...this._scripts.map((script, index) => {
      const li = document.createElement('li');
      li.dataset.index = String(index);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(index === selected));
      li.textContent = scriptLabel(script, this._space);
      return li;
    }));
    if (this._scripts.length === 0) {
      const li = document.createElement('li');
      li.className = 'cr-project-empty';
      li.textContent = 'No scripts: Add one';
      this.list.appendChild(li);
    }
    this.list.children[selected]?.scrollIntoView?.({ block: 'nearest' });
  }
}
