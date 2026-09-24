// The time the page was built. web/build.mjs replaces the placeholder in the
// bundle with the build time (UTC); unbundled (e.g. under Node) it is ''.

const STAMP = '__BUILD_STAMP__';

/** e.g. '2026-09-23 14:39:14 UTC', or '' when not built by web/build.mjs. */
export const BUILD_STAMP = STAMP.startsWith('__') ? '' : STAMP;
