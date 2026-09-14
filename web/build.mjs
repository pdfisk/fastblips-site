// Builds the single-file playground: bundles src/browser.js with esbuild and
// inlines it between the page's markup and its script.
//
//   node web/build.mjs            -> web/crumb-playground.html  (artifact form)
//   node web/build.mjs --standalone -> adds a doctype/head wrapper so the file
//                                      opens directly in a browser
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const standalone = process.argv.includes('--standalone');
const scratch = mkdtempSync(join(tmpdir(), 'crumb-'));
const bundlePath = join(scratch, 'crumb.min.js');

execFileSync('npx', ['--yes', 'esbuild@0.23.1', join(here, '..', 'src', 'browser.js'),
  '--bundle', '--format=iife', '--global-name=Crumb', '--target=es2020', '--minify',
  `--outfile=${bundlePath}`], { stdio: 'inherit' });

const read = (name) => readFileSync(join(here, name), 'utf8');
const page = [
  read('playground.head.html'),
  read('playground.body.html'),
  '<script>', readFileSync(bundlePath, 'utf8'), '</script>',
  '<script>', read('playground.script.js'), '</script>',
].join('\n');

const html = standalone
  ? ['<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>',
    '</head><body>', page, '</body></html>'].join('\n')
  : page;

const out = join(here, standalone ? 'crumb-playground.standalone.html' : 'crumb-playground.html');
writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} kB`);
