// Application start-up: builds the initial widget tree.

import { Viewport } from './widgets/viewport.js';
import { Navbar } from './widgets/navbar.js';
import { StatusBar } from './widgets/status-bar.js';
import { scheduler } from './runtime.js';
import { Menu } from './widgets/menu.js';
import { Button } from './widgets/button.js';
import { Spacer } from './widgets/spacer.js';
import { Label } from './widgets/label.js';
import { TranscriptWindow } from './windows/transcript-window.js';
import { BasicConsoleWindow } from './windows/basic-console-window.js';
import { PythonConsoleWindow } from './windows/python-console-window.js';
import { SchedulerWindow } from './windows/scheduler-window.js';
import { DesignerWindow } from './windows/designer-window.js';
import { ConsoleWindow } from './windows/console-window.js';
import { MENU_THEMES, setTheme, themeName } from './theme.js';
import { CODE_FONTS, installCodeFont, setCodeFont, codeFontName } from './fonts.js';
import { BasicDatabaseWindow, PythonDatabaseWindow } from './windows/database-window.js';
import { SERVERS, setServer, serverName } from './db-client.js';
import { BUILD_STAMP } from './build-info.js';
import { isMobileDevice } from './device.js';
import { startMobile } from './mobile/app.js';
import { runParameter, startRuntime, RUN_TABLES } from './run-app.js';
import { listApps } from './app-list.js';
import { DesktopLaunchWindow } from './windows/launch-window.js';

/**
 * Starts the UI the page calls for: with ?run=<program name>, that program
 * from the database as a full-page app (on any device); otherwise the mobile
 * landing page on a phone, else the full UI. ?ui=mobile or ?ui=desktop
 * overrides the device detection.
 */
export function start() {
  const program = runParameter();
  if (program) return startRuntime(program);
  return isMobileDevice() ? startMobile() : startDesktop();
}

/** The full UI: Navbar, windows and StatusBar in a Viewport. */
export function startDesktop() {
  const viewport = Viewport.instance.mount(document.body);
  installCodeFont();
  const navbar = Navbar.instance;
  const transcript = TranscriptWindow.instance;

  navbar.add(fileMenu(viewport));
  navbar.add(databaseMenu(viewport));
  navbar.add(new Button('Basic', () => new BasicConsoleWindow().open(viewport)));
  navbar.add(new Button('Python', () => new PythonConsoleWindow().open(viewport)));
  navbar.add(new Button('Process', () => SchedulerWindow.instance.open(viewport)));
  navbar.add(new Button('Designer', () => new DesignerWindow().open(viewport)));
  navbar.add(settingsMenu());
  navbar.add(windowsMenu(viewport, transcript));
  navbar.add(applicationsMenu(viewport));
  navbar.add(new Spacer());
  navbar.add(buildLabel());
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
  const parts = ['running', 'ready', 'sleeping', 'waiting', 'scheduled', 'suspended']
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

// The build timestamp, at the right end of the Navbar (empty when unbundled).
function buildLabel() {
  const label = new Label(BUILD_STAMP ? `Built ${BUILD_STAMP}` : '');
  label.element.classList.add('cr-build-stamp');
  label.element.style.color = 'var(--cr-nav-text)';
  label.element.style.opacity = '0.7';
  label.element.style.paddingRight = '12px';
  return label;
}

// The Settings menu. Theme, Code Font and Database each open a submenu of
// choices: the one in use is checked, and choosing another switches to it at
// once and remembers it for the next visit.
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
  menu.addSubmenu('Database', () => SERVERS.map(([name, label]) => ({
    label,
    action: () => setServer(name),
    checked: () => serverName() === name,
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

// The Applications menu, after Windows, lists the compiled apps: programs in
// the Basic and Python tables saved with their compiled code (the Database
// window's Compile button), by name. Choosing one runs it in a Desktop launch
// window, from its compiled code. The list is read from the database each
// time the menu opens: the last list shows at once, and the menu is redrawn
// when the new one arrives.
function applicationsMenu(viewport) {
  const menu = new Menu('Applications');
  const languages = Object.fromEntries(RUN_TABLES);
  let apps = null;          // the last list read, or null before the first
  let error = null;         // why the last read failed, or null
  let loading = null;       // the read in progress
  let redrawing = false;

  const refresh = () => {
    loading ??= listApps().then((list) => { apps = list; error = null; }, (err) => { error = err; })
      .finally(() => {
        loading = null;
        if (!menu.isOpen) return;
        redrawing = true;
        try { menu.open(); } finally { redrawing = false; }
      });
  };
  document.addEventListener('cr-dbserverchange', () => { apps = null; error = null; });

  const note = (label) => ({ label, action() {}, enabled: () => false });
  menu.itemsProvider = () => {
    if (!redrawing) refresh();
    if (apps === null) return [note(error ? `Cannot read the database: ${error.message}` : 'Loading...')];
    if (apps.length === 0) return [note('No compiled apps: use Compile in a Database window')];
    return apps.map((app) => ({
      label: app.table === 'python' ? `${app.name} (Python)` : app.name,
      action: () => launchApp(viewport, app, languages[app.table]),
    }));
  };
  return menu;
}

/** Runs a compiled app in a new Desktop launch window. */
function launchApp(viewport, app, language) {
  const { record } = app;
  new DesktopLaunchWindow({
    title: app.name,
    source: record.content ?? '',
    language,
    compiled: record.compiled_code,
    priority: record.priority ?? undefined,
  }).open(viewport);
}
