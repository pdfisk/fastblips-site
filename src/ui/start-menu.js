// The start menu of apps and games: the shared projects in the four app and
// game categories, in groups. It is shown when FastBlips starts (unless its
// "Show at startup" box is cleared): as the Apps and Games window in the
// desktop UI, and as the mobile landing page on a phone. On a phone the
// mobile games come first; on a desktop the desktop games do.

import { listSharedProjects, projectCategory, projectCategoryLabel } from './projects.js';

/** The group order on a desktop device. */
export const DESKTOP_ORDER = ['desktop-game', 'desktop-app', 'mobile-game', 'mobile-app'];

/** The group order on a mobile device. */
export const MOBILE_ORDER = ['mobile-game', 'mobile-app', 'desktop-game', 'desktop-app'];

/** The categories the start menu lists, in the order for the device (mobile: true for a phone). */
export function startMenuOrder(mobile) {
  return mobile ? MOBILE_ORDER : DESKTOP_ORDER;
}

/**
 * The start menu's groups for projects (shared projects with scripts):
 * [{ category, label, projects }] in the device's order, leaving out empty
 * groups and projects in other categories (Development).
 */
export function startMenuSections(projects, mobile) {
  return startMenuOrder(mobile).map((category) => ({
    category,
    label: `${projectCategoryLabel(category)}s`,
    projects: (projects ?? []).filter((p) => projectCategory(p) === category),
  })).filter((s) => s.projects.length > 0);
}

/** Reads the shared projects and returns startMenuSections for them. */
export async function loadStartMenu({ mobile = false, store } = {}) {
  return startMenuSections(await listSharedProjects({ store }), mobile);
}

/** True for a category whose projects run in a phone-sized window. */
export const isMobileCategory = (category) => String(category).startsWith('mobile-');

const STORAGE_KEY = 'fastblips.startMenu';

/** Whether the start menu is shown when FastBlips starts (yes, unless turned off). */
export function showStartMenuAtStartup() {
  try { return globalThis.localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function setShowStartMenuAtStartup(show) {
  try { globalThis.localStorage.setItem(STORAGE_KEY, show ? 'on' : 'off'); } catch { /* storage blocked */ }
}
