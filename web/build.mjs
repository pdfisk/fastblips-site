// Builds the single-file page: bundles src/ui/browser.js with esbuild and
// inlines it, followed by the call that starts the widget UI.
//
//   node web/build.mjs              -> web/crumb-playground.html  (artifact form:
//                                        no doctype/head, the host supplies one)
//   node web/build.mjs --standalone -> web/index.html (a complete document that
//                                        opens directly in a browser)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const standalone = process.argv.includes('--standalone');
const scratch = mkdtempSync(join(tmpdir(), 'crumb-'));
const bundlePath = join(scratch, 'crumb.min.js');

execFileSync('npx', ['--yes', 'esbuild@0.23.1', join(here, '..', 'src', 'ui', 'browser.js'),
  '--bundle', '--format=iife', '--global-name=Crumb', '--target=es2020', '--minify',
  `--outfile=${bundlePath}`], {
  stdio: 'inherit',
  shell: process.platform === 'win32',   // npx is npx.cmd on Windows
});

// Stamped into the page at build time. SOURCE_DATE_EPOCH (seconds) overrides
// it, so a reproducible build can pin the date instead of reading the clock.
const epoch = process.env.SOURCE_DATE_EPOCH;
const builtAt = epoch ? new Date(Number(epoch) * 1000) : new Date();
const buildIso = builtAt.toISOString().replace(/\.\d+Z$/, 'Z');   // 2026-09-14T16:51:03Z
// UTC, and labelled as such: a bare wall-clock time from whatever machine ran
// the build tells the reader nothing.
const buildStamp = `${buildIso.slice(0, 10)} ${buildIso.slice(11, 19)} UTC`;

// The page is now just the widget UI: the bundle, then a call that builds the
// Viewport. (The old playground.* files are no longer included.)
const page = [
  `<meta name="crumb-build" content="__BUILD_ISO__">`,
  '<style>html,body{margin:0;height:100%}</style>',
  '<script>', readFileSync(bundlePath, 'utf8'), '</script>',
  '<script>Crumb.ui.start();</script>',
].join('\n')
  .replaceAll('__BUILD_ISO__', buildIso)
  .replaceAll('__BUILD_STAMP__', buildStamp);

const SITE_DESCRIPTION = 'Write, run and share Python programs in your browser: '
  + 'games, apps and windows, with nothing to install.';

const html = standalone
  ? ['<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>FastBlips</title>',
    // What search results and link previews (Slack, iMessage, social media)
    // show. Link previews need absolute URLs.
    `<meta name="description" content="${SITE_DESCRIPTION}">`,
    '<link rel="canonical" href="https://fastblips.com/">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="FastBlips">',
    '<meta property="og:title" content="FastBlips">',
    `<meta property="og:description" content="${SITE_DESCRIPTION}">`,
    '<meta property="og:url" content="https://fastblips.com/">',
    '<meta property="og:image" content="https://fastblips.com/icon-512.png">',
    '<meta property="og:image:width" content="512">',
    '<meta property="og:image:height" content="512">',
    '<meta name="twitter:card" content="summary">',
    '<meta name="theme-color" content="#3a6ea5">',
    // Relative paths, so the page also works from a subfolder. The files sit
    // next to index.html in web/ and are made by electron/scripts/make-icon.py.
    '<link rel="icon" href="favicon.ico" sizes="any">',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
    '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>',
    '</head><body>', page, '</body></html>'].join('\n')
  : page;

const out = join(here, standalone ? 'index.html' : 'crumb-playground.html');
writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} kB  built ${buildStamp}`);
