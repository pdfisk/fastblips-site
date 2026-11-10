// Backing up and restoring the desktop app's own database (File > Back Up
// Database... and Restore Database..., in the desktop app only). The desktop
// shell does the work and shows the dialogs (electron/src/db/backup.js); this
// asks it, and after a restore tells every window to read its records again.
// No DOM is needed, so it runs (and is tested) under Node.

import { isDesktopServer } from './db-client.js';

const bridge = () => globalThis.fastblipsDesktop;

/** Whether this is a desktop app that can back up and restore its database. */
export function canBackUpDatabase() {
  return typeof bridge()?.backupDatabase === 'function' && typeof bridge()?.restoreDatabase === 'function';
}

/** "3 projects, 5 scripts, 1 saved screen". */
export function describeCounts({ scripts = 0, projects = 0, viewports = 0 } = {}) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  return [n(projects, 'project', 'projects'), n(scripts, 'script', 'scripts'), n(viewports, 'saved screen', 'saved screens')].join(', ');
}

// Electron wraps an error from the main process as "Error invoking remote
// method 'db:restore': DatabaseError: <message>"; the message is what matters.
function plain(e) {
  const message = String(e?.message ?? e).replace(/^Error invoking remote method '[^']*': (\w*Error: )?/, '');
  // "a backup cannot..." reads as a sentence; a file name stays as it is.
  return new Error(/^[a-z]+ /.test(message) ? message.charAt(0).toUpperCase() + message.slice(1) : message);
}

/**
 * Asks where to save a backup and writes it. Resolves to { name, path,
 * counts, message }, or null if cancelled; a failure is thrown with a plain message.
 */
export async function backUpDesktopDatabase() {
  if (!canBackUpDatabase()) throw new Error('Only the desktop app has a database to back up');
  let result;
  try { result = await bridge().backupDatabase(); } catch (e) { throw plain(e); }
  if (!result) return null;
  return { ...result, message: `Backed up to ${result.name}: ${describeCounts(result.counts)}` };
}

/**
 * Asks for a backup, confirms, and replaces the desktop database with it.
 * Then every window reads its records again (a cr-dbserverchange event, as
 * when Settings > Database changes). Resolves to { name, path, counts,
 * message }, or null if cancelled; a failure is thrown with a plain message.
 */
export async function restoreDesktopDatabase() {
  if (!canBackUpDatabase()) throw new Error('Only the desktop app has a database to restore');
  let result;
  try { result = await bridge().restoreDatabase(); } catch (e) { throw plain(e); }
  if (!result) return null;
  globalThis.document?.dispatchEvent(new CustomEvent('cr-dbserverchange',
    { detail: { name: 'desktop', url: 'fbdb://local', restored: true } }));
  const note = isDesktopServer() ? '' : ' (Settings > Database > Desktop to use it)';
  return { ...result, message: `Restored ${result.name}: ${describeCounts(result.counts)}${note}` };
}
