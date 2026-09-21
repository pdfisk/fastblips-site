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
import { BasicDatabaseWindow, PythonDatabaseWindow } from './windows/database-window.js';

export function start() {
  const viewport = Viewport.instance.mount(document.body);
  const navbar = Navbar.instance;
  const transcript = TranscriptWindow.instance;

  navbar.add(new Button('Basic', () => new BasicConsoleWindow().open(viewport)));
  navbar.add(new Button('Python', () => new PythonConsoleWindow().open(viewport)));
  navbar.add(databaseMenu(viewport));
  navbar.add(new Button('Scheduler', () => SchedulerWindow.instance.open(viewport)));
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
