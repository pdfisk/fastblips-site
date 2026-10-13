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
