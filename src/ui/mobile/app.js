// The mobile UI, shown on a phone when the address names no app (no ?run=):
// the list of compiled apps, each a link that runs it full-page, and a link
// to the full playground. It uses plain DOM rather than the desktop widgets
// (Viewport, Window, ...), which are built for a mouse and a large screen.

import { installTheme } from '../theme.js';
import { BUILD_STAMP } from '../build-info.js';
import { listApps, runUrl, projectUrl } from '../app-list.js';
import { listSharedProjects } from '../projects.js';

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
.cr-mobile p{margin:0 0 12px}
.cr-mobile-apps{list-style:none;margin:0 0 4px;padding:0;display:flex;flex-direction:column;gap:8px}
.cr-mobile-app{display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-height:48px;padding:10px 14px;border-radius:var(--cr-radius-button);text-decoration:none;
  background:var(--cr-button-bg);color:var(--cr-button-text);box-shadow:var(--cr-button-shadow);
  border:1px solid transparent;font-weight:600}
.cr-mobile-app:active{background:var(--cr-button-hover);box-shadow:var(--cr-button-active-shadow)}
.cr-mobile-app small{font-weight:400;color:var(--cr-text-muted)}
.cr-mobile h2{margin:16px 0 8px;font-size:18px;text-align:center}
.cr-mobile-status{color:var(--cr-text-muted);text-align:center}
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
      <p class="cr-mobile-tagline">Apps made with Basic and Python</p>
      <p class="cr-mobile-status">Loading apps...</p>
      <ul class="cr-mobile-apps" aria-label="Apps"></ul>
      <h2 class="cr-mobile-heading" hidden>Shared projects</h2>
      <p class="cr-mobile-status cr-mobile-projects-status" hidden></p>
      <ul class="cr-mobile-apps cr-mobile-projects" aria-label="Shared projects"></ul>
      <a class="cr-mobile-full" href="">Open the full playground (made for a larger screen)</a>
    </section>
    <footer class="cr-mobile-footer"></footer>`;
  root.querySelector('.cr-mobile-full').href = desktopUrl.href;
  root.querySelector('.cr-mobile-footer').textContent = BUILD_STAMP ? `Built ${BUILD_STAMP}` : '';
  document.body.appendChild(root);

  const status = root.querySelector('.cr-mobile-status');
  const list = root.querySelector('.cr-mobile-apps');
  const ready = listApps().then((apps) => {
    status.textContent = apps.length ? 'Tap an app to run it.' : 'There are no apps yet.';
    list.replaceChildren(...apps.map((app) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'cr-mobile-app';
      a.href = runUrl(app.name, undefined, app.owner);
      a.append(app.name);
      const lang = document.createElement('small');
      lang.textContent = app.table === 'python' ? 'Python' : 'Basic';
      a.append(lang);
      li.append(a);
      return li;
    }));
  }, (err) => {
    status.textContent = `Could not read the app list: ${err?.message ?? err}`;
  });

  // The projects anyone has shared, each a link that runs the project full-page.
  const heading = root.querySelector('.cr-mobile-heading');
  const projectsStatus = root.querySelector('.cr-mobile-projects-status');
  const projectList = root.querySelector('.cr-mobile-projects');
  const projectsReady = listSharedProjects().then((projects) => {
    heading.hidden = false;
    projectsStatus.hidden = projects.length > 0;
    projectsStatus.textContent = 'There are no shared projects yet.';
    projectList.replaceChildren(...projects.map((project) => {
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
  }, (err) => {
    heading.hidden = false;
    projectsStatus.hidden = false;
    projectsStatus.textContent = `Could not read the shared projects: ${err?.message ?? err}`;
  });
  return { root, ready: Promise.all([ready, projectsReady]).then(() => undefined) };
}
