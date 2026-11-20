// WelcomeWindow: the singleton window opened from Help > Welcome (it is not
// shown at startup; the Apps and Games window is). It says what FastBlips is
// and links to the documentation: each link opens the Python or Widget
// Documentation window at a section.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { PythonHelpWindow } from './python-help-window.js';
import { WidgetHelpWindow } from './widget-help-window.js';

let instance = null;

/** The paragraphs that say what FastBlips is. */
export const WELCOME_TEXT = [
  'FastBlips is a place to write, run and share programs in Python, entirely in '
    + 'your browser. There is nothing to install: the editor, the Python interpreter '
    + 'and the scheduler that runs your programs all live in this page.',
  'A program made here is a BLIP: a Bytecode Loadable Interpreted Program. It can '
    + 'print text, draw on a canvas, run a game with physics, or be a whole app made '
    + 'of windows, buttons and lists. Several programs can run at once; Windows > '
    + 'Process Browser shows them.',
  'Keep your work in My Projects, borrow from what other people share in '
    + 'Shared Projects, and publish an app so anyone can open it at '
    + 'fastblips.com?app=<you>/<name>, on a desktop or a phone.',
];

/** How to start, after the description. */
export const WELCOME_START = 'To begin, choose File > New Python, type print("Hello"), and press Run.';

/**
 * The documentation links, in groups: [heading, [[label, window, section,
 * blurb], ...]]. window is 'python' or 'widgets'; section is the label of an
 * entry in that window's list.
 */
export const WELCOME_LINKS = [
  ['Python', [
    ['Getting started', 'python', 'Getting started', 'running a program, output and mistakes'],
    ['Events and handlers', 'python', 'Events and handlers', 'programs that respond to clicks and keys'],
    ['Drawing and games', 'python', 'Drawing and games', 'Canvas, Board and Physics'],
    ['Example programs', 'python', 'Example programs', 'complete programs to try'],
    ['Differences from Python', 'python', 'Differences from Python', 'what BlipPy does differently'],
  ]],
  ['Widgets', [
    ['All widgets', 'widgets', 'All widgets', 'every widget a program can make'],
    ['Common methods', 'widgets', 'Common methods', 'what every widget can do'],
  ]],
];

const HELP_WINDOWS = { python: () => PythonHelpWindow.instance, widgets: () => WidgetHelpWindow.instance };

const STYLE = `
.cr-welcome{position:absolute;box-sizing:border-box;overflow:auto;padding:16px 20px;
  background:var(--cr-window-bg);color:var(--cr-text);font:var(--cr-font-size)/1.5 var(--cr-font-ui)}
.cr-welcome h1{margin:0 0 10px;font-size:1.6em;font-weight:bold}
.cr-welcome h2{margin:16px 0 4px;font-size:1.1em;font-weight:bold;color:var(--cr-text)}
.cr-welcome p{margin:0 0 8px}
.cr-welcome code{font-family:var(--cr-font-code)}
.cr-welcome ul{margin:0;padding:0;list-style:none}
.cr-welcome li{margin:2px 0}
.cr-welcome-link{font:inherit;padding:0;border:0;background:none;color:var(--cr-accent);
  text-decoration:underline;cursor:pointer}
.cr-welcome-link:hover,.cr-welcome-link:focus-visible{text-decoration:none}
.cr-welcome-blurb{color:var(--cr-text-muted)}
`;

function installStyle() {
  if (document.getElementById('cr-welcome-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-welcome-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const el = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};

class WelcomePanel extends Panel {
  constructor(owner) {
    super();
    installStyle();
    this.element.classList.add('cr-welcome');
    this.element.append(el('h1', 'Welcome to FastBlips'));
    for (const text of WELCOME_TEXT) this.element.append(el('p', text));
    this.element.append(el('p', WELCOME_START));
    this.links = [];
    for (const [heading, links] of WELCOME_LINKS) {
      this.element.append(el('h2', `${heading} documentation`));
      const list = el('ul');
      for (const [label, which, section, blurb] of links) {
        const button = el('button', label, 'cr-welcome-link');
        button.type = 'button';
        button.addEventListener('click', () => owner.openDocs(which, section));
        this.links.push(button);
        const item = el('li');
        item.append(button, el('span', ` – ${blurb}`, 'cr-welcome-blurb'));
        list.append(item);
      }
      this.element.append(list);
    }
  }
}

export class WelcomeWindow extends Window {
  /** The single WelcomeWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new WelcomeWindow();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('WelcomeWindow is a singleton; use WelcomeWindow.instance');
    super({ title: 'Welcome', x: 140, y: 50, width: 580, height: 610, minWidth: 320, minHeight: 240 });
    instance = this;
    this.element.classList.add('cr-welcome-window');
    this.panel = new WelcomePanel(this);
    this.content = this.panel;
    this.buttonBar.addButton('Close', () => this.close());
  }

  /** Opens the Python ('python') or Widget ('widgets') Documentation window at a section. */
  openDocs(which, section) {
    const win = HELP_WINDOWS[which]();
    win.open(this.parent);
    win.show(section);
    return win;
  }

  dispose() {
    super.dispose();
    instance = null;
  }
}
