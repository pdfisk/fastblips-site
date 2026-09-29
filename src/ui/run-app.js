// The ?run=<program name> page: runs one program from the database as a
// full-page app, instead of the playground (see docs/widgets.txt).
//
//   - The browser window (tab) is titled with the program name.
//   - An AppScreen fills the Viewport: a TextPanel the program prints to,
//     with the program's widgets (AddButton, ...) over it.
//   - Go and Reset buttons sit in a ButtonBar along the bottom of the
//     Viewport and act as in a LaunchWindow (see ProgramRunner).
//   - The program starts as soon as it has loaded, as if Go were pressed.
//
// The source is read from the database server (db-client.js): the record
// with that name in the Basic table, else in the Python table. Its table
// decides the language.

import { Viewport } from './widgets/viewport.js';
import { AppScreen } from './widgets/app-screen.js';
import { ButtonBar } from './widgets/button-bar.js';
import { SourceStore, TABLES, StoreError } from './db-client.js';
import { BasicConsoleWindow } from './windows/basic-console-window.js';
import { PythonConsoleWindow } from './windows/python-console-window.js';
import { ProgramRunner } from './program-runner.js';

/** The tables searched for the program, in order, and their languages. */
export const RUN_TABLES = [
  ['basic', BasicConsoleWindow],
  ['python', PythonConsoleWindow],
];

/** The program name in a ?run= query parameter, or null. */
export function runParameter(g = globalThis) {
  try {
    const name = new URLSearchParams(g.location?.search ?? '').get('run')?.trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Finds the record named name: in the first table (of RUN_TABLES order) that
 * has one, matching the name exactly, else ignoring case. Resolves to
 * { record, language } or null if no table has it. Rejects with a
 * StoreError if no table could be read.
 */
export async function findProgram(name, { stores } = {}) {
  const tables = RUN_TABLES.map(([table, language]) => ({
    language,
    store: stores?.[table] ?? new SourceStore(TABLES[table]),
  }));
  const results = await Promise.allSettled(tables.map((t) => t.store.list()));
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const lower = name.toLowerCase();
  for (const exact of [true, false]) {
    for (let i = 0; i < tables.length; i++) {
      if (results[i].status !== 'fulfilled') continue;
      const record = (results[i].value ?? []).find((r) => (exact
        ? r.name === name
        : String(r.name ?? '').toLowerCase() === lower));
      if (record) return { record, language: tables[i].language };
    }
  }
  return null;
}

/**
 * Builds the page for the program called name and loads it. Returns
 * { viewport, screen, textPanel, buttonBar, goButton, resetButton, runner, ready },
 * where ready resolves once the program is loaded and started (runner is
 * set then).
 */
export function startRuntime(name) {
  document.title = name;
  const viewport = Viewport.instance.mount(document.body);
  viewport.element.classList.add('cr-run-page');

  const screen = new AppScreen();
  const { textPanel } = screen;
  textPanel.text = `Loading ${name}...`;
  const buttonBar = new ButtonBar();
  const page = { viewport, screen, textPanel, buttonBar, runner: null };
  page.goButton = buttonBar.addButton('Go', () => page.runner?.go());
  page.resetButton = buttonBar.addButton('Reset', () => page.runner?.reset());
  page.goButton.enabled = false;
  page.resetButton.enabled = false;
  viewport.content = screen;
  viewport.statusBar = buttonBar;

  page.ready = findProgram(name).then((found) => {
    if (!found) {
      textPanel.text = `There is no program named "${name}" in the database.\n`;
      return page;
    }
    textPanel.text = '';
    page.runner = new ProgramRunner({
      language: found.language,
      source: found.record.content ?? '',
      // Compiled code saved with the record (the Database window's Compile
      // button) runs without compiling, while it matches the source.
      compiled: found.record.compiled_code ?? null,
      priority: found.record.priority ?? undefined,
      screen,
      name,
    });
    page.goButton.enabled = true;
    page.resetButton.enabled = true;
    page.runner.go();
    return page;
  }, (err) => {
    const message = err instanceof StoreError ? err.message : String(err?.message ?? err);
    textPanel.text = `Could not load "${name}": ${message}\n`;
    return page;
  });
  return page;
}
