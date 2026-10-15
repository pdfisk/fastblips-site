// The ?run=<program name> page: runs one program from the database as a
// full-page app, instead of the playground (see docs/widgets.txt).
//
//   - The browser window (tab) is titled with the program name.
//   - An AppScreen fills the Viewport: a TextPanel the program prints to,
//     with the program's widgets (New Button, ...) over it.
//   - Go and Reset buttons sit in a ButtonBar along the bottom of the
//     Viewport and act as in a LaunchWindow (see ProgramRunner).
//   - The program starts as soon as it has loaded, as if Go were pressed.
//
// ?project=<owner>/<name> runs a project the same way: every script of that
// user's project, in order, together on the one screen (startProjectRuntime).
//
// The source is read from the database server (db-client.js). ?run=abc is
// the program abc in the shared space; ?run=peter/abc is abc in the user
// peter's space. A Basic program is found before a Python one of the same
// name, and the record's language decides how it runs. The screens the
// program loads by name are its owner's (setSpace).

import { Viewport } from './widgets/viewport.js';
import { AppScreen } from './widgets/app-screen.js';
import { ButtonBar } from './widgets/button-bar.js';
import { SourceStore, TABLES, StoreError, USER_NAME_PATTERN, setSpace } from './db-client.js';
import { BasicConsoleWindow } from './windows/basic-console-window.js';
import { PythonConsoleWindow } from './windows/python-console-window.js';
import { ProgramRunner, ProgramSetRunner } from './program-runner.js';
import { PROJECTS, SCRIPTS } from './projects.js';

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
 * Splits a ?run= value "owner/name" into { owner, name }, or returns null if
 * it does not start with a user name and a slash.
 */
export function splitRunName(value) {
  const slash = value.indexOf('/');
  const owner = value.slice(0, Math.max(slash, 0));
  const name = value.slice(slash + 1).trim();
  return slash > 0 && name && USER_NAME_PATTERN.test(owner) ? { owner, name } : null;
}

/**
 * Finds the program a ?run= value names: "owner/name" in that user's space,
 * else (or failing that, for a shared program whose name has a slash) the
 * whole value in the shared space. Resolves to { record, language, owner }
 * (owner '' for shared) or null if there is none. Rejects with a StoreError
 * if the database could not be read.
 */
export async function findProgram(value, { stores } = {}) {
  const split = splitRunName(value);
  const places = [...(split ? [split] : []), { owner: '', name: value }];
  for (const { owner, name } of places) {
    const found = await findInSpace(name, owner, stores);
    if (found) return { ...found, owner };
  }
  return null;
}

// The record named name in owner's space: in the first table (of RUN_TABLES
// order) that has one, matching the name exactly, else ignoring case.
async function findInSpace(name, owner, stores) {
  const tables = RUN_TABLES.map(([table, language]) => {
    const store = stores?.[table] ?? new SourceStore(TABLES[table]);
    return { language, store: store.inSpace ? store.inSpace(owner) : store };
  });
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

/** The project name in a ?project= query parameter, or null. */
export function projectParameter(g = globalThis) {
  try {
    const name = new URLSearchParams(g.location?.search ?? '').get('project')?.trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Finds the project a ?project= value names: "owner/name" in that user's
 * space, else (or failing that) the whole value in the shared space. Resolves
 * to { record, owner, programs } or null if there is none: programs is one
 * { name, language, source, compiled, priority } per script of the project,
 * in order (a script that no longer exists is left out; missing counts them).
 * Rejects with a StoreError if the database could not be read.
 * @param {string} value
 * @param {{stores?: {projects: object, scripts: object}}} [options] - stores
 *   to read (tests); by default the database server in use
 */
export async function findProject(value, { stores } = {}) {
  const split = splitRunName(value);
  const places = [...(split ? [split] : []), { owner: '', name: value }];
  const projects = stores?.projects ?? new SourceStore(PROJECTS);
  for (const { owner, name } of places) {
    const store = projects.inSpace ? projects.inSpace(owner) : projects;
    const records = (await store.list()) ?? [];
    const lower = name.toLowerCase();
    const record = records.find((r) => r.name === name)
      ?? records.find((r) => String(r.name ?? '').toLowerCase() === lower);
    if (!record) continue;
    const scripts = (await (stores?.scripts ?? new SourceStore(SCRIPTS)).list()) ?? [];
    const byId = new Map(scripts.map((s) => [s.id, s]));
    const languages = Object.fromEntries(RUN_TABLES);
    const programs = [];
    let missing = 0;
    for (const { id } of record.scripts ?? []) {
      const script = byId.get(id);
      const language = languages[script?.language];
      if (!script || !language) { missing += 1; continue; }
      programs.push({
        name: script.name,
        language,
        source: script.content ?? '',
        compiled: script.compiled_code ?? null,
        priority: script.priority ?? undefined,
      });
    }
    return { record, owner, programs, missing };
  }
  return null;
}

// Builds the full-page app: an AppScreen filling the Viewport with Go and
// Reset buttons along the bottom. load() resolves to null (nothing found) or
// { owner, runner(screen) }, which makes the runner for the screen; the
// runner is started as soon as it is made.
function startPage(name, load, notFound) {
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

  page.ready = load().then((found) => {
    if (!found) {
      textPanel.text = notFound;
      return page;
    }
    textPanel.text = '';
    setSpace(found.owner);
    page.runner = found.runner(screen);
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

/**
 * Builds the page for the program called name and loads it. Returns
 * { viewport, screen, textPanel, buttonBar, goButton, resetButton, runner, ready },
 * where ready resolves once the program is loaded and started (runner is
 * set then).
 */
export function startRuntime(name) {
  return startPage(name, async () => {
    const found = await findProgram(name);
    if (!found) return null;
    return {
      owner: found.owner,
      runner: (screen) => new ProgramRunner({
        language: found.language,
        source: found.record.content ?? '',
        // Compiled code saved with the record (the Database window's Compile
        // button) runs without compiling, while it matches the source.
        compiled: found.record.compiled_code ?? null,
        priority: found.record.priority ?? undefined,
        screen,
        name,
      }),
    };
  }, `There is no program named "${name}" in the database.\n`);
}

/**
 * Builds the page for the project called name (a ?project= value) and loads
 * it: every script of the project, run together on the one screen. Returns
 * what startRuntime does.
 */
export function startProjectRuntime(name) {
  return startPage(name, async () => {
    const found = await findProject(name);
    if (!found) return null;
    if (found.programs.length === 0) throw new Error('the project has no scripts to run');
    return { owner: found.owner, runner: (screen) => new ProgramSetRunner({ programs: found.programs, screen }) };
  }, `There is no project named "${name}" in the database.\n`);
}
