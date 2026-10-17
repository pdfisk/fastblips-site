// Projects: named, ordered lists of scripts in a user's space, with a
// description (the projects table of rails/server). This is the part of the
// Projects window that needs no DOM, so it also runs (and is tested) under
// Node.
//
// A project record is { id, name, description, owner, scripts }, where
// scripts is [{ id, name, language, owner, shared }] in the project's order.
// A script can be in any number of projects. It can be one of the user's
// own, one that another user has shared, or one in the shared space. Saving
// a project with script_ids makes those its scripts, in that order.

import { SourceStore, spaceName } from './db-client.js';

/** The projects in the page's space. */
export const PROJECTS = { resource: 'projects', key: 'project', owner: spaceName };

/** The scripts in every space: the project's own and those others have shared. */
export const SCRIPTS = { resource: 'scripts', key: 'script' };

export const projectStore = () => new SourceStore(PROJECTS);
export const scriptStore = () => new SourceStore(SCRIPTS);

const LANGUAGE_TITLES = { basic: 'Basic', python: 'Python' };

/** Records by name, ignoring case, then by id (the server gives them by id). */
export function byName(records) {
  return [...(records ?? [])].sort((x, y) => String(x.name ?? '')
    .localeCompare(String(y.name ?? ''), undefined, { sensitivity: 'base' }) || x.id - y.id);
}

/** A project's script as { id, name, language, owner, shared }, language by title. */
export function projectScript(script) {
  return {
    id: script.id,
    name: script.name ?? '',
    language: LANGUAGE_TITLES[script.language] ?? String(script.language ?? ''),
    owner: script.owner ?? '',
    shared: Boolean(script.shared),
  };
}

/** The label of a script in a list: 'name  Python', and '· owner' for another user's. */
export function scriptLabel(script, space = '') {
  const owner = String(script.owner ?? '');
  const other = owner !== '' && owner.toLowerCase() !== String(space ?? '').toLowerCase();
  return `${script.name ?? ''}  ${script.language ?? ''}${other ? `  \u00b7 ${owner}` : ''}`;
}

/**
 * The scripts that can be added to a project in a space, by name: the
 * space's own, those other users have shared and those in the shared space,
 * without the ones already in the project.
 * @param {object[]} scripts - script records, from every space
 * @param {number[]} inProject - ids of the scripts the project has
 * @param {string} space - the project's space: a user name, '' for shared
 * @returns {object[]} projectScript()s
 */
export function availableScripts(scripts, inProject, space = '') {
  const have = new Set(inProject);
  const mine = String(space ?? '').toLowerCase();
  return byName(scripts)
    .filter((s) => !have.has(s.id))
    .filter((s) => !s.owner || s.shared || String(s.owner).toLowerCase() === mine)
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
 * The projects anyone has shared and that have scripts to run, by name.
 * @param {{store?: SourceStore}} [options] - the store to read (tests); by default every space
 */
export async function listSharedProjects({ store } = {}) {
  return sharedProjects(await (store ?? allProjectStore()).list()).filter((p) => (p.scripts ?? []).length > 0);
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
 * Copies a project into the space of the stores (the user's own: My
 * Projects), as a project of that user with their own copies of its scripts.
 * The scripts have to be copied too: a project can only list scripts that its
 * owner has or that are shared, and the author could change theirs. Each is
 * made from the snapshot the source holds (the scripts as the project was
 * last saved), keeping its name unless the user already has a script of that
 * name, which then gets ' 2', ' 3'... added. If the project cannot be made,
 * the scripts made for it are removed again.
 * @param {object} source - a project with its snapshots (GET /projects/:id)
 * @param {{name?: string, projects: SourceStore, scripts: SourceStore}} options -
 *   name: the new project's name (the source's by default); projects and
 *   scripts: stores for the target space, the scripts one without a language
 * @returns {Promise<{project: object, renamed: {from: string, to: string}[]}>}
 *   the new project, and the scripts that had to be renamed
 */
export async function copyProject(source, { name, projects, scripts }) {
  const newName = String(name ?? source.name ?? '').trim();
  if (!newName) throw new Error('A name is required');
  if ((await projects.list()).some((p) => sameName(p.name, newName))) {
    throw new Error(`You already have a project called "${newName}"`);
  }
  const taken = (await scripts.list()).map((s) => s.name);
  const made = [];
  const renamed = [];
  try {
    for (const s of source.scripts ?? []) {
      const scriptName = uniqueName(s.name, taken);
      taken.push(scriptName);
      if (scriptName !== s.name) renamed.push({ from: s.name, to: scriptName });
      const fields = { name: scriptName, language: s.language, content: s.content ?? '' };
      if (s.priority != null) fields.priority = s.priority;
      if (s.compiled_code != null) fields.compiled_code = s.compiled_code;
      made.push(await scripts.create(fields));
    }
    const project = await projects.create({
      name: newName,
      description: source.description ?? '',
      shared: false,
      script_ids: made.map((s) => s.id),
    });
    return { project, renamed };
  } catch (e) {
    await Promise.all(made.map((s) => scripts.remove(s.id).catch(() => {})));
    throw e;
  }
}

/**
 * The Details page of a project, as text: its name, owner, number of scripts
 * and (if given) when it was updated, then its description.
 * @param {object} project - a project record
 * @param {string} [updated] - the time to show for Updated (empty to leave the line out)
 */
export function projectDetails(project, updated = '') {
  const lines = [
    `Name:    ${project.name ?? ''}`,
    `Owner:   ${project.owner || '(shared)'}`,
    `Scripts: ${(project.scripts ?? []).length}`,
  ];
  if (updated) lines.push(`Updated: ${updated}`);
  const description = String(project.description ?? '').trim();
  return `${lines.join('\n')}\n\n${description || '(no description)'}`;
}
