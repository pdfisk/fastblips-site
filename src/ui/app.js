// Application start-up: builds the initial widget tree.

import { Viewport } from './widgets/viewport.js';
import { Navbar } from './widgets/navbar.js';
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

  transcript.open(viewport);
  return viewport;
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

// The Windows menu lists every open window, front-most first; choosing one
// shows it (if hidden) and brings it to the front. The Transcript is always
// listed, so it can be reopened after being closed.
function windowsMenu(viewport, transcript) {
  const menu = new Menu('Windows');
  menu.itemsProvider = () => {
    const windows = viewport.windows.reverse();
    if (!windows.includes(transcript)) windows.push(transcript);
    return windows.map((win) => ({
      label: win.title,
      action: () => win.open(viewport),
      checked: () => win.isOpen && win.isFront,
    }));
  };
  return menu;
}
