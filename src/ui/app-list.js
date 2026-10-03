// The compiled apps: records in the Basic and Python tables whose compiled
// code has been saved (the Database window's Compile button). The desktop's
// Applications menu and the mobile app list show them. No DOM is needed, so
// this also runs (and is tested) under Node.

import { SourceStore, TABLES } from './db-client.js';

/** The tables searched, in order: the same order ?run= uses (run-app.js). */
export const APP_TABLES = ['basic', 'python'];

/** True if record has compiled code saved with it. */
export function isCompiled(record) {
  return typeof record?.compiled_code === 'string' && record.compiled_code.trim() !== '';
}

/**
 * Every compiled app, as { name, table, record } (table: 'basic' or
 * 'python'), sorted by name ignoring case. A table that cannot be read is
 * skipped; rejects with that table's StoreError if neither can be read.
 * @param {{stores?: Record<string, SourceStore>}} [options] - stores to read,
 *   by table name (tests); by default the database server in use
 */
export async function listApps({ stores } = {}) {
  const results = await Promise.allSettled(APP_TABLES.map(
    (table) => (stores?.[table] ?? new SourceStore(TABLES[table])).list()));
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const apps = [];
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    for (const record of result.value ?? []) {
      const name = String(record?.name ?? '').trim();
      if (name && isCompiled(record)) apps.push({ name, table: APP_TABLES[i], record });
    }
  });
  return apps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    || APP_TABLES.indexOf(a.table) - APP_TABLES.indexOf(b.table));
}

/**
 * The address that runs the app called name as a full page: this page with
 * ?run=<name>, keeping a db= choice of server and dropping anything else.
 */
export function runUrl(name, href = globalThis.location?.href ?? 'http://localhost/') {
  const url = new URL(href);
  const db = url.searchParams.get('db');
  url.search = '';
  url.hash = '';
  url.searchParams.set('run', name);
  if (db) url.searchParams.set('db', db);
  return url.href;
}
