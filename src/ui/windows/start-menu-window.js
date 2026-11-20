// StartMenuWindow: the singleton Apps and Games window, shown when the
// desktop UI starts (unless its "Show at startup" box is cleared) and from
// Help > Apps and Games. It lists the shared projects that are games and
// apps, desktop games first (see start-menu.js); choosing one runs it in a
// Desktop launch window, or a Mobile one for a mobile game or app. The list
// is read each time the window opens, and by Refresh.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { DesktopLaunchWindow, MobileLaunchWindow } from './launch-window.js';
import { allProjectStore, projectPrograms, projectCategory } from '../projects.js';
import { RUN_TABLES } from '../run-app.js';
import { Toast } from '../toast.js';
import {
  loadStartMenu, isMobileCategory, showStartMenuAtStartup, setShowStartMenuAtStartup,
} from '../start-menu.js';

let instance = null;

const STYLE = `
.cr-start{position:absolute;box-sizing:border-box;overflow:auto;padding:14px 18px;
  background:var(--cr-window-bg);color:var(--cr-text);font:var(--cr-font-size)/1.5 var(--cr-font-ui)}
.cr-start h1{margin:0 0 8px;font-size:1.4em;font-weight:bold}
.cr-start h2{margin:14px 0 6px;font-size:1.05em;font-weight:bold}
.cr-start-status{margin:0 0 8px;color:var(--cr-text-muted)}
.cr-start-list{margin:0;padding:0;list-style:none;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.cr-start-item{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:0;
  padding:6px 10px;border:1px solid transparent;border-radius:var(--cr-radius-button);
  background:var(--cr-button-bg);color:var(--cr-button-text);box-shadow:var(--cr-button-shadow);
  font:inherit;font-weight:600;text-align:left;cursor:pointer}
.cr-start-item:hover,.cr-start-item:focus-visible{background:var(--cr-button-hover)}
.cr-start-item small{font-weight:400;color:var(--cr-text-muted)}
.cr-start-startup{display:flex;align-items:center;gap:6px;margin-top:16px;color:var(--cr-text-muted)}
`;

function installStyle() {
  if (document.getElementById('cr-start-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-start-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const el = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};

class StartMenuPanel extends Panel {
  constructor(owner) {
    super();
    installStyle();
    this.element.classList.add('cr-start');
    this.element.append(el('h1', 'Apps and Games'));
    this.status = el('p', 'Loading...', 'cr-start-status');
    this.sections = el('div');
    this.element.append(this.status, this.sections);
    const startup = el('label', undefined, 'cr-start-startup');
    this.startupBox = el('input');
    this.startupBox.type = 'checkbox';
    this.startupBox.checked = showStartMenuAtStartup();
    this.startupBox.addEventListener('change', () => setShowStartMenuAtStartup(this.startupBox.checked));
    startup.append(this.startupBox, el('span', 'Show at startup'));
    this.element.append(startup);
    this.owner = owner;
  }

  show(sections) {
    this.status.textContent = sections.length
      ? 'Choose one to run it.'
      : 'Nobody has shared an app or a game yet.';
    this.sections.replaceChildren(...sections.flatMap(({ label, projects }) => {
      const list = el('ul', undefined, 'cr-start-list');
      for (const project of projects) {
        const button = el('button', project.name, 'cr-start-item');
        button.type = 'button';
        button.append(el('small', project.owner || '(shared)'));
        button.addEventListener('click', () => this.owner.launch(project));
        const item = el('li');
        item.append(button);
        list.append(item);
      }
      return [el('h2', label), list];
    }));
  }
}

export class StartMenuWindow extends Window {
  /** The single StartMenuWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new StartMenuWindow();
    return instance;
  }

  /**
   * @param {{load?: () => Promise<object[]>, get?: (id: number) => Promise<object>}} [options] -
   *   how the sections and a project are read (tests)
   */
  constructor({ load, get } = {}) {
    if (instance) throw new Error('StartMenuWindow is a singleton; use StartMenuWindow.instance');
    super({ title: 'Apps and Games', x: 140, y: 50, width: 600, height: 520, minWidth: 320, minHeight: 240 });
    instance = this;
    this.element.classList.add('cr-start-window');
    this._load = load ?? (() => loadStartMenu({ mobile: false }));
    this._get = get ?? ((id) => allProjectStore().get(id));
    this.panel = new StartMenuPanel(this);
    this.content = this.panel;
    this.buttonBar.addButton('Refresh', () => this.refresh());
    this.buttonBar.addButton('Close', () => this.close());
  }

  open(viewport) {
    super.open(viewport);
    this.refresh();
    return this;
  }

  /** Reads the list again; resolves once it is shown. */
  async refresh() {
    this.panel.status.textContent = 'Loading...';
    try {
      this.panel.show(await this._load());
    } catch (e) {
      this.panel.sections.replaceChildren();
      this.panel.status.textContent = `Could not read the apps and games: ${e?.message ?? e}`;
    }
  }

  /** Runs a project in a Desktop launch window, or a Mobile one for a mobile game or app. */
  async launch(project) {
    if (!this.parent) return null;
    try {
      const full = await this._get(project.id);
      const { programs } = projectPrograms(full.scripts, Object.fromEntries(RUN_TABLES));
      if (programs.length === 0) return null;
      const Cls = isMobileCategory(projectCategory(project)) ? MobileLaunchWindow : DesktopLaunchWindow;
      return new Cls({ title: project.name, programs }).open(this.parent);
    } catch (e) {
      Toast.show(this.parent, { kind: 'error', message: `Cannot run ${project.name}: ${e.message}` });
      return null;
    }
  }

  dispose() {
    super.dispose();
    instance = null;
  }
}
