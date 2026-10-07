// Projects: named groups of scripts in a user's space, with a description
// (the projects table of rails/server). This is the part of the Projects
// window that needs no DOM, so it also runs (and is tested) under Node.
//
// A project record is { id, name, description, owner, scripts }, where
// scripts is [{ id, name, language }]. Its scripts are the scripts in its
// space whose project_name is its name, so a script is in at most one
// project. Saving a project with script_ids makes those its scripts.

import { SourceStore, spaceName } from './db-client.js';

/** The projects in the page's space. */
export const PROJECTS = { resource: 'projects', key: 'project', owner: spaceName };

/** The scripts in the page's space, whatever their language. */
export const SCRIPTS = { resource: 'scripts', key: 'script', owner: spaceName };

export const projectStore = () => new SourceStore(PROJECTS);
export const scriptStore = () => new SourceStore(SCRIPTS);

const LANGUAGE_TITLES = { basic: 'Basic', python: 'Python' };

/** Records by name, ignoring case, then by id (the server gives them by id). */
export function byName(records) {
  return [...(records ?? [])].sort((x, y) => String(x.name ?? '')
    .localeCompare(String(y.name ?? ''), undefined, { sensitivity: 'base' }) || x.id - y.id);
}

/**
 * The rows of a project's script list: every script in the space, by name,
 * as { id, name, language, checked, note }. A script is checked when it is
 * in the project; note says which other project it is in, if any (checking
 * it moves it here).
 * @param {object[]} scripts - script records ({ id, name, language, project_name })
 * @param {{name?: string, scripts?: {id: number}[]}|null} project - the
 *   project as saved; null or one with no id has no scripts yet
 */
export function scriptRows(scripts, project) {
  const mine = new Set((project?.scripts ?? []).map((s) => s.id));
  const name = project?.name ?? '';
  return byName(scripts).map((s) => {
    const checked = mine.has(s.id);
    const other = !checked && s.project_name && s.project_name !== name ? s.project_name : '';
    return {
      id: s.id,
      name: s.name ?? '',
      language: LANGUAGE_TITLES[s.language] ?? String(s.language ?? ''),
      checked,
      note: other ? `in ${other}` : '',
    };
  });
}

/** True when two lists of ids hold the same ids, in any order. */
export function sameIds(a, b) {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((id) => y.has(id));
}
