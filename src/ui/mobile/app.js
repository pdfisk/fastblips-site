// The mobile UI: for now a single landing page. It uses plain DOM rather than
// the desktop widgets (Viewport, Window, ...), which are built for a mouse and
// a large screen.

import { installTheme } from '../theme.js';
import { BUILD_STAMP } from '../build-info.js';

const STYLE = `
.cr-mobile{box-sizing:border-box;min-height:100vh;min-height:100dvh;margin:0;
  padding:max(24px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom));
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
  text-align:center;background:var(--cr-desktop-bg);color:var(--cr-text);
  font:16px/1.5 var(--cr-font-ui);-webkit-text-size-adjust:100%}
.cr-mobile *{box-sizing:border-box}
.cr-mobile-card{width:100%;max-width:420px;padding:28px 22px;border-radius:14px;
  background:var(--cr-window-bg);border:1px solid var(--cr-window-border);box-shadow:var(--cr-window-shadow)}
.cr-mobile h1{margin:0 0 6px;font-size:32px;line-height:1.2}
.cr-mobile .cr-mobile-tagline{margin:0 0 18px;color:var(--cr-text-muted)}
.cr-mobile p{margin:0 0 12px}
.cr-mobile code{font:15px var(--cr-font-mono)}
.cr-mobile-button{display:inline-block;margin-top:8px;padding:12px 20px;min-height:44px;border-radius:10px;
  background:var(--cr-accent);color:var(--cr-accent-text);text-decoration:none;font-weight:600}
.cr-mobile-footer{font-size:13px;color:var(--cr-window-bg);opacity:.85}
`;

/** Shows the mobile landing page in document.body; returns its root element. */
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
      <h1>Crumb</h1>
      <p class="cr-mobile-tagline">A playground for Crumb and Python</p>
      <p>Write and run small programs in <code>Crumb</code>, a Visual-Basic-flavoured
        language, and in a Python subset, on one shared virtual machine.</p>
      <p>The playground is made for a larger screen. Open this page on a
        computer to use it.</p>
      <a class="cr-mobile-button" href="">Open the full version anyway</a>
    </section>
    <footer class="cr-mobile-footer"></footer>`;
  root.querySelector('.cr-mobile-button').href = desktopUrl.href;
  root.querySelector('.cr-mobile-footer').textContent = BUILD_STAMP ? `Built ${BUILD_STAMP}` : '';

  document.body.appendChild(root);
  return root;
}
