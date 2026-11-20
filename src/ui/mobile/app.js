// The mobile UI, shown on a phone when the address names no app (no ?app=):
// the start menu of shared apps and games (see start-menu.js), mobile games
// first, then mobile apps, desktop games and desktop apps, each a link that
// runs it full-page; a "Show at startup" box (when cleared, the list waits
// behind a "Show apps and games" button); and a link to the full playground. It uses plain DOM rather than the desktop widgets
// (Viewport, Window, ...), which are built for a mouse and a large screen.

import { installTheme } from '../theme.js';
import { BUILD_STAMP } from '../build-info.js';
import { projectUrl } from '../app-list.js';
import { loadStartMenu, showStartMenuAtStartup, setShowStartMenuAtStartup } from '../start-menu.js';

const STYLE = `
.cr-mobile{box-sizing:border-box;min-height:100vh;min-height:100dvh;margin:0;
  padding:max(24px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom));
  display:flex;flex-direction:column;align-items:center;gap:20px;
  background:var(--cr-desktop-bg);color:var(--cr-text);
  font:16px/1.5 var(--cr-font-ui);-webkit-text-size-adjust:100%}
.cr-mobile *{box-sizing:border-box}
.cr-mobile-card{width:100%;max-width:420px;padding:22px 18px;border-radius:14px;
  background:var(--cr-window-bg);border:1px solid var(--cr-window-border);box-shadow:var(--cr-window-shadow)}
.cr-mobile h1{margin:0 0 4px;font-size:30px;line-height:1.2;text-align:center}
.cr-mobile .cr-mobile-tagline{margin:0 0 16px;color:var(--cr-text-muted);text-align:center}
.cr-mobile h2{margin:0 0 6px;font-size:18px;line-height:1.3}
.cr-mobile p{margin:0 0 12px}
.cr-mobile-apps{list-style:none;margin:0 0 4px;padding:0;display:flex;flex-direction:column;gap:8px}
.cr-mobile-app{display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-height:48px;padding:10px 14px;border-radius:var(--cr-radius-button);text-decoration:none;
  background:var(--cr-button-bg);color:var(--cr-button-text);box-shadow:var(--cr-button-shadow);
  border:1px solid transparent;font-weight:600}
.cr-mobile-app:active{background:var(--cr-button-hover);box-shadow:var(--cr-button-active-shadow)}
.cr-mobile-app small{font-weight:400;color:var(--cr-text-muted)}
.cr-mobile-status{color:var(--cr-text-muted);text-align:center}
.cr-mobile-startup{display:flex;align-items:center;gap:8px;margin-top:14px;color:var(--cr-text-muted);font-size:15px}
.cr-mobile-startup input{width:20px;height:20px}
.cr-mobile-show{width:100%;min-height:48px;margin:4px 0;border:0;border-radius:var(--cr-radius-button);
  background:var(--cr-button-bg);color:var(--cr-button-text);box-shadow:var(--cr-button-shadow);font:inherit;font-weight:600}
.cr-mobile-sections h2{margin-top:14px}
.cr-mobile-full{display:block;margin-top:16px;text-align:center;color:var(--cr-text-muted);font-size:14px}
.cr-mobile-footer{font-size:13px;color:var(--cr-window-bg);opacity:.85}
`;

/**
 * Shows the mobile page in document.body and loads the app list; returns
 * { root, ready }, where ready resolves once the list is shown (or the
 * database could not be read).
 */
export function startMobile() {
  installTheme();
  document.getElementById('cr-mobile-style') ?? document.head.appendChild(
    Object.assign(document.createElement('style'), { id: 'cr-mobile-style', textContent: STYLE }));

  const desktopUrl = new URL(location.href);
  desktopUrl.searchParams.set('ui', 'desktop');

  const root = document.createElement('main');
  root.className = 'cr-mobile';
  root.innerHTML = `
    <section class="cr-mobile-card">
      <h1>FastBlips</h1>
      <p class="cr-mobile-tagline">Apps made with Python</p>
      <button type="button" class="cr-mobile-show" hidden>Show apps and games</button>
      <div class="cr-mobile-menu">
        <p class="cr-mobile-status">Loading apps and games...</p>
        <div class="cr-mobile-sections"></div>
      </div>
      <label class="cr-mobile-startup"><input type="checkbox" class="cr-mobile-startup-box"> Show at startup</label>
      <a class="cr-mobile-full" href="">Open the full playground (made for a larger screen)</a>
    </section>
    <footer class="cr-mobile-footer"></footer>`;
  root.querySelector('.cr-mobile-full').href = desktopUrl.href;
  root.querySelector('.cr-mobile-footer').textContent = BUILD_STAMP ? `Built ${BUILD_STAMP}` : '';
  document.body.appendChild(root);

  const status = root.querySelector('.cr-mobile-status');
  const sectionsEl = root.querySelector('.cr-mobile-sections');
  const menu = root.querySelector('.cr-mobile-menu');
  const showButton = root.querySelector('.cr-mobile-show');
  const startupBox = root.querySelector('.cr-mobile-startup-box');
  startupBox.checked = showStartMenuAtStartup();
  startupBox.addEventListener('change', () => setShowStartMenuAtStartup(startupBox.checked));
  // With "Show at startup" cleared, the list waits behind a button.
  if (!startupBox.checked) {
    menu.hidden = true;
    showButton.hidden = false;
  }
  showButton.addEventListener('click', () => { menu.hidden = false; showButton.hidden = true; });

  // The games and apps anyone has shared, mobile games first, each a link
  // that runs the project full-page.
  const ready = loadStartMenu({ mobile: true }).then((sections) => {
    status.textContent = sections.length ? 'Tap one to run it.' : 'There are no shared apps or games yet.';
    sectionsEl.replaceChildren(...sections.flatMap(({ label, projects }) => {
      const heading = document.createElement('h2');
      heading.textContent = label;
      const list = document.createElement('ul');
      list.className = 'cr-mobile-apps cr-mobile-projects';
      list.setAttribute('aria-label', label);
      list.append(...projects.map((project) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'cr-mobile-app';
        a.href = projectUrl(project.name, undefined, project.owner);
        a.append(project.name);
        const owner = document.createElement('small');
        owner.textContent = project.owner || '(shared)';
        a.append(owner);
        li.append(a);
        return li;
      }));
      return [heading, list];
    }));
  }, (err) => {
    status.textContent = `Could not read the shared apps and games: ${err?.message ?? err}`;
  });
  return { root, ready };
}
