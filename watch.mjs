// Rebuilds the playground whenever a source file changes, so the "Built"
// timestamp on the page always reflects the latest edit.
//
//   node web/watch.mjs      (or: npm run watch)
//
// Watches src/ and the web/playground.* inputs. Changes arriving close
// together (an editor saving several files) are coalesced into one build.
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const DEBOUNCE_MS = 300;

let timer = null;
let building = false;
let pending = false;

function runBuild(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, 'build.mjs'), ...args],
      { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code));
  });
}

async function build(reason) {
  if (building) { pending = true; return; }
  building = true;
  console.log(`\n[watch] ${reason} - rebuilding`);
  await runBuild(['--standalone']);   // web/index.html
  await runBuild([]);                 // web/crumb-playground.html
  building = false;
  if (pending) { pending = false; build('more changes'); }
}

function schedule(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => build(reason), DEBOUNCE_MS);
}

watch(join(root, 'src'), { recursive: true }, (_event, file) => {
  if (file && file.endsWith('.js')) schedule(`src/${file.replaceAll('\\', '/')} changed`);
});
watch(here, (_event, file) => {
  if (file && file.startsWith('playground.')) schedule(`web/${file} changed`);
});

console.log('[watch] watching src/ and web/playground.* (Ctrl+C to stop)');
build('startup');
