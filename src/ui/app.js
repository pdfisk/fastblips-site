// Application start-up: builds the initial widget tree.

import { Viewport } from './widgets/viewport.js';
import { Navbar } from './widgets/navbar.js';
import { StatusBar } from './widgets/status-bar.js';
import { scheduler } from './runtime.js';
import { Menu } from './widgets/menu.js';
import { Button } from './widgets/button.js';
import { TranscriptWindow } from './windows/transcript-window.js';
import { BasicConsoleWindow } from './windows/basic-console-window.js';
import { PythonConsoleWindow } from './windows/python-console-window.js';
import { SchedulerWindow } from './windows/scheduler-window.js';
import { ConsoleWindow } from './windows/console-window.js';
import { MENU_THEMES, setTheme, themeName } from './theme.js';
import { CODE_FONTS, installCodeFont, setCodeFont, codeFontName } from './fonts.js';
import { BasicDatabaseWindow, PythonDatabaseWindow } from './windows/database-window.js';

export function start() {
  const viewport = Viewport.instance.mount(document.body);
  installCodeFont();
  const navbar = Navbar.instance;
  const transcript = TranscriptWindow.instance;

  navbar.add(fileMenu(viewport));
  navbar.add(databaseMenu(viewport));
  navbar.add(new Button('Basic', () => new BasicConsoleWindow().open(viewport)));
  navbar.add(new Button('Python', () => new PythonConsoleWindow().open(viewport)));
  navbar.add(new Button('Process', () => SchedulerWindow.instance.open(viewport)));
  navbar.add(settingsMenu());
  navbar.add(windowsMenu(viewport, transcript));
  viewport.navbar = navbar;
  viewport.statusBar = statusBar(viewport);

  // Each minimized window gets a button on the StatusBar that restores it.
  viewport.element.addEventListener('windowstate', () => {
    StatusBar.instance.setTasks(viewport.minimizedWindows.map((win) => ({
      label: win.title,
      title: `Restore ${win.title}`,
      action: () => win.open(viewport),
    })));
  });

  transcript.open(viewport);
  return viewport;
}

// The StatusBar shows messages from the consoles on the left and a live
// summary of the scheduler on the right.
function statusBar() {
  const bar = StatusBar.instance;
  const update = () => { bar.info = schedulerSummary(); };
  update();
  setInterval(update, 500);
  return bar;
}

function schedulerSummary() {
  const counts = {};
  for (const p of scheduler.list()) counts[p.state] = (counts[p.state] ?? 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 'No processes';
  const parts = ['running', 'ready', 'sleeping', 'scheduled', 'suspended']
    .filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`);
  return `${total} process${total === 1 ? '' : 'es'}: ${parts.join(', ')}`;
}

// The File menu:
//   New Basic    a new, empty Basic console
//   New Python   a new, empty Python console
//   Open...      a source file in a new console of the matching language
//                (.crumb/.bas: Basic, .py: Python)
//   Save         the front-most console's source, to its file
//   Save As...   the front-most console's source, to a new file
//   Delete       the front-most console's file, after confirming
// Save and Save As are greyed out unless a console is the front-most showing
// window; Delete also needs that console's file to be deletable (a file
// opened or saved through the File System Access API, in Chrome or Edge).
function fileMenu(viewport) {
  const menu = new Menu('File');
  const frontConsole = () => {
    const front = viewport.visibleWindows.at(-1);
    return front instanceof ConsoleWindow ? front : null;
  };
  const hasConsole = () => frontConsole() !== null;
  const newConsole = (Cls) => () => new Cls({ text: '' }).open(viewport).input.focus();
  menu.addItem('New Basic', newConsole(BasicConsoleWindow));
  menu.addItem('New Python', newConsole(PythonConsoleWindow));
  menu.addSeparator();
  menu.addItem('Open...', () => ConsoleWindow.openInNewConsole([BasicConsoleWindow, PythonConsoleWindow], viewport));
  menu.addItem('Save', () => frontConsole()?.save(), { enabled: hasConsole });
  menu.addItem('Save As...', () => frontConsole()?.saveAs(), { enabled: hasConsole });
  menu.addSeparator();
  menu.addItem('Delete', () => frontConsole()?.deleteFile(), {
    enabled: () => Boolean(frontConsole()?.canDeleteFile),
  });
  return menu;
}

// The Settings menu. Theme and Code Font each open a submenu of choices: the
// one in use is checked, and choosing another switches to it at once and
// remembers it for the next visit.
function settingsMenu() {
  const menu = new Menu('Settings');
  menu.addSubmenu('Theme', () => MENU_THEMES.map(([name, label]) => ({
    label,
    action: () => setTheme(name),
    checked: () => themeName() === name,
  })));
  menu.addSubmenu('Code Font', () => Object.entries(CODE_FONTS).map(([name, font]) => ({
    label: font.label,
    action: () => setCodeFont(name),
    checked: () => codeFontName() === name,
  })));
  return menu;
}

// The Database menu, third on the Navbar, opens a browser for each table on
// the database server (rails/server). There is one browser per table;
// choosing it again brings it to the front.
function databaseMenu(viewport) {
  const menu = new Menu('Database');
  menu.addItem('Basic', () => BasicDatabaseWindow.instance.open(viewport));
  menu.addItem('Python', () => PythonDatabaseWindow.instance.open(viewport));
  return menu;
}

// The Windows menu starts with commands for all windows, then lists every
// open window, front-most first; choosing one shows it (if hidden or
// minimized) and brings it to the front. The Transcript is always listed, so
// it can be reopened after being closed.
function windowsMenu(viewport, transcript) {
  const menu = new Menu('Windows');
  menu.itemsProvider = () => {
    const open = viewport.windows;   // before the Transcript is added below
    const windows = open.slice().reverse();
    const anyShowing = () => viewport.visibleWindows.length > 0;
    const commands = [
      { label: 'Arrange Windows', action: () => viewport.arrangeWindows(), enabled: anyShowing },
      { label: 'Minimize All', action: () => viewport.minimizeAll(), enabled: anyShowing },
      {
        label: 'Restore All',
        action: () => viewport.restoreAll(),
        enabled: () => open.some((w) => w.minimized || w.maximized),
      },
      { label: 'Close All', action: () => viewport.closeAll(), enabled: () => open.length > 0 },
      { separator: true },
    ];
    if (!windows.includes(transcript)) windows.push(transcript);
    return [...commands, ...windows.map((win) => ({
      label: win.title,
      action: () => win.open(viewport),
      checked: () => win.isOpen && win.isFront,
    }))];
  };
  return menu;
}
