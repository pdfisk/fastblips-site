// Projects: named, ordered lists of scripts in a user's space, with a
// description (the projects table of rails/server). This is the part of the
// Projects window that needs no DOM, so it also runs (and is tested) under
// Node.
//
// A project record is { id, name, description, owner, shared, category, scripts }, where
// scripts is the project's own copies of its scripts, in order, each
// { name, language, content, priority?, compiled_code? } (a project script).
// Adding a script to a project copies a script record into it (one of the
// user's own or one in the shared space); changing the project's copy leaves
// the record as it was. Names are unique within a project, ignoring case.
// Saving a project with scripts makes those its scripts, in that order.

import { SourceStore, spaceName } from './db-client.js';

/** The projects in the page's space. */
export const PROJECTS = { resource: 'projects', key: 'project', owner: spaceName };

/** The scripts in every space: the project's own and those in the shared space. */
export const SCRIPTS = { resource: 'scripts', key: 'script' };

export const projectStore = () => new SourceStore(PROJECTS);
export const scriptStore = () => new SourceStore(SCRIPTS);

const LANGUAGE_TITLES = { python: 'Python' };

/**
 * A project's categories: the value stored on the server, and its label.
 * The mobile start page lists the shared projects that are mobile games.
 */
export const PROJECT_CATEGORIES = [
  { value: 'development', label: 'Development' },
  { value: 'desktop-game', label: 'Desktop Game' },
  { value: 'desktop-app', label: 'Desktop App' },
  { value: 'mobile-game', label: 'Mobile Game' },
  { value: 'mobile-app', label: 'Mobile App' },
];

/** The category a project has when none is given (and that older records read as). */
export const DEFAULT_PROJECT_CATEGORY = 'development';

/** A project's category: its own, or the default for a record that has none. */
export function projectCategory(project) {
  return project?.category || DEFAULT_PROJECT_CATEGORY;
}

/** The label of a category value: 'Mobile Game' for 'mobile-game'. */
export function projectCategoryLabel(value) {
  return PROJECT_CATEGORIES.find((c) => c.value === value)?.label ?? String(value ?? '');
}

/** Records by name, ignoring case, then by id (the server gives them by id). */
export function byName(records) {
  return [...(records ?? [])].sort((x, y) => String(x.name ?? '')
    .localeCompare(String(y.name ?? ''), undefined, { sensitivity: 'base' }) || x.id - y.id);
}

/** The title of a language for lists: 'Python' for 'python'; anything else as it is. */
export function languageTitle(language) {
  return LANGUAGE_TITLES[language] ?? String(language ?? '');
}

const nameKey = (name) => String(name ?? '').trim().toLowerCase();

/**
 * A project script as the server keeps it, from a script record or another
 * project script: { name, language, content }, plus priority and
 * compiled_code when it has them. The fields are always in this order, so
 * two lists can be compared as text (sameScripts).
 */
export function projectScriptCopy(script) {
  const copy = { name: String(script?.name ?? '').trim(), language: String(script?.language ?? ''), content: String(script?.content ?? '') };
  if (script?.priority != null && script.priority !== '') copy.priority = script.priority;
  if (script?.compiled_code != null && script.compiled_code !== '') copy.compiled_code = script.compiled_code;
  return copy;
}

/** True when two lists of project scripts hold the same scripts, in the same order. */
export function sameScripts(a, b) {
  const text = (list) => JSON.stringify((list ?? []).map(projectScriptCopy));
  return text(a) === text(b);
}

/** The project script called name (ignoring case) among scripts, or undefined. */
export function findProjectScript(name, scripts) {
  const key = nameKey(name);
  return (scripts ?? []).find((s) => nameKey(s.name) === key);
}

/**
 * The programs a launch window or page runs for a list of project scripts, in
 * order: { name, language, source, compiled, priority }, where language is
 * the console class for the script's language (languages: { python: Class }).
 * Scripts in a language there is no class for are left out; skipped counts them.
 */
export function projectPrograms(scripts, languages) {
  const programs = [];
  let skipped = 0;
  for (const script of scripts ?? []) {
    const language = languages[script?.language];
    if (!language) { skipped += 1; continue; }
    programs.push({
      name: script.name,
      language,
      source: script.content ?? '',
      compiled: script.compiled_code ?? null,
      priority: script.priority ?? undefined,
    });
  }
  return { programs, skipped };
}

/** A script record as an entry of the Add list: { id, name, language, owner }, language by title. */
export function projectScript(script) {
  return {
    id: script.id,
    name: script.name ?? '',
    language: languageTitle(script.language),
    owner: script.owner ?? '',
  };
}

/** The label of a script in a list: 'name  Python', and '· owner' for another user's. */
export function scriptLabel(script, space = '') {
  const owner = String(script.owner ?? '');
  const other = owner !== '' && owner.toLowerCase() !== String(space ?? '').toLowerCase();
  return `${script.name ?? ''}  ${languageTitle(script.language)}${other ? `  \u00b7 ${owner}` : ''}`;
}

/**
 * The scripts that can be copied into a project in a space, by name: the
 * space's own and those in the shared space, without any whose name the
 * project already has a script by (names are unique in a project).
 * @param {object[]} scripts - script records, from every space
 * @param {string[]} inProject - the names of the scripts the project has
 * @param {string} space - the project's space: a user name, '' for shared
 * @returns {object[]} projectScript()s
 */
export function availableScripts(scripts, inProject, space = '') {
  const have = new Set([...(inProject ?? [])].map(nameKey));
  const mine = String(space ?? '').toLowerCase();
  return byName(scripts)
    .filter((s) => !have.has(nameKey(s.name)))
    .filter((s) => !s.owner || String(s.owner).toLowerCase() === mine)
    .map(projectScript);
}

/** A copy of items with the one at index moved by delta places (-1 up, 1 down), kept in range. */
export function moved(items, index, delta) {
  const list = [...items];
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  [list[index], list[to]] = [list[to], list[index]];
  return list;
}

/** True when two lists of ids hold the same ids in the same order. */
export function sameList(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Every project in every space, as a store (no owner: it reads all spaces). */
export const allProjectStore = () => new SourceStore({ resource: 'projects', key: 'project' });

/** The shared projects among records, by name. */
export function sharedProjects(records) {
  return byName((records ?? []).filter((p) => p?.shared === true && String(p.name ?? '').trim() !== ''));
}

/**
 * The Shared Projects list: the shared projects among records that belong to other
 * users, by name. The signed-in user's own are left out (they are in My
 * Projects); with nobody signed in, every shared project is listed.
 * @param {object[]} records - the projects read from the server
 * @param {string} [user] - the signed-in user's name, '' if none
 */
export function libraryProjects(records, user = '') {
  const me = String(user ?? '').trim().toLowerCase();
  return sharedProjects(records).filter((p) => !me || String(p.owner ?? '').trim().toLowerCase() !== me);
}

/**
 * The projects anyone has shared and that have scripts to run, by name;
 * given a category, only those of that category.
 * @param {{store?: SourceStore, category?: string}} [options] - store: the
 *   store to read (tests), by default every space; category: e.g. 'mobile-game'
 */
export async function listSharedProjects({ store, category } = {}) {
  return sharedProjects(await (store ?? allProjectStore()).list())
    .filter((p) => (p.scripts ?? []).length > 0)
    .filter((p) => !category || projectCategory(p) === category);
}

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** name if no taken name matches it (ignoring case), else 'name 2', 'name 3'... the first that is free. */
export function uniqueName(name, taken) {
  const used = new Set([...(taken ?? [])].map((n) => String(n ?? '').trim().toLowerCase()));
  if (!used.has(String(name).trim().toLowerCase())) return name;
  for (let n = 2; ; n += 1) {
    if (!used.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
  }
}

/**
 * Copies a project into the space of the store (the user's own: My
 * Projects), as an unshared project of that user. The scripts come with it:
 * they are the project's own copies, so the new project has copies of its own.
 * @param {object} source - a project record
 * @param {{name?: string, projects: SourceStore}} options - name: the new
 *   project's name (the source's by default); projects: the store for the target space
 * @returns {Promise<{project: object}>} the new project
 */
export async function copyProject(source, { name, projects }) {
  const newName = String(name ?? source.name ?? '').trim();
  if (!newName) throw new Error('A name is required');
  if ((await projects.list()).some((p) => sameName(p.name, newName))) {
    throw new Error(`You already have a project called "${newName}"`);
  }
  const project = await projects.create({
    name: newName,
    description: source.description ?? '',
    shared: false,
    category: projectCategory(source),
    scripts: (source.scripts ?? []).map(projectScriptCopy),
  });
  return { project };
}

/**
 * The Details page of a project, as text: its name, owner, category, number
 * of scripts and (if given) when it was updated, then its description.
 * @param {object} project - a project record
 * @param {string} [updated] - the time to show for Updated (empty to leave the line out)
 */
export function projectDetails(project, updated = '') {
  const lines = [
    `Name:     ${project.name ?? ''}`,
    `Owner:    ${project.owner || '(shared)'}`,
    `Category: ${projectCategoryLabel(projectCategory(project))}`,
    `Scripts:  ${(project.scripts ?? []).length}`,
  ];
  if (updated) lines.push(`Updated:  ${updated}`);
  const description = String(project.description ?? '').trim();
  return `${lines.join('\n')}\n\n${description || '(no description)'}`;
}
