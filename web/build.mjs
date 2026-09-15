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

const html = standalone
  ? ['<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>',
    '</head><body>', page, '</body></html>'].join('\n')
  : page;

const out = join(here, standalone ? 'index.html' : 'crumb-playground.html');
writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} kB  built ${buildStamp}`);
