// The code font: the monospace font used for source, output and lists
// (Settings > Code Font). It is independent of the theme.
//
// Each choice sets --cr-font-code on <html>, falling back to the theme's own
// monospace font (--cr-font-mono) until the web font has loaded, or for good
// if it cannot be fetched. The font file comes from Google Fonts the first
// time it is chosen. A 'cr-fontchange' event on document announces each
// change, so the Monaco editor (which cannot read CSS variables) can follow.

export const CODE_FONTS = {
  jetbrains: {
    label: 'JetBrains Mono',
    family: '"JetBrains Mono"',
    css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap',
  },
  plex: {
    label: 'IBM Plex Mono',
    family: '"IBM Plex Mono"',
    css: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap',
  },
};

export const DEFAULT_CODE_FONT = 'jetbrains';
const STORAGE_KEY = 'crumb.codeFont';
let current = null;

/** The code font chosen: a key of CODE_FONTS. */
export function codeFontName() {
  return current ?? savedCodeFont() ?? DEFAULT_CODE_FONT;
}

/** The CSS font-family list for the code font in effect. */
export function codeFontFamily() {
  const font = CODE_FONTS[codeFontName()];
  const fallback = getComputedStyle(document.documentElement).getPropertyValue('--cr-font-mono').trim()
    || 'ui-monospace, Consolas, monospace';
  return `${font.family}, ${fallback}`;
}

/** Applies the saved (or default) code font. Called once at start-up. */
export function installCodeFont() {
  applyCodeFont(codeFontName(), { remember: false });
}

/** Switches the code font and remembers the choice for the next visit. */
export function setCodeFont(name) {
  applyCodeFont(name, { remember: true });
}

function applyCodeFont(name, { remember }) {
  const font = CODE_FONTS[name];
  if (!font) throw new Error(`unknown code font '${name}'`);
  current = name;
  loadStylesheet(font);
  document.documentElement.style.setProperty('--cr-font-code', `${font.family}, var(--cr-font-mono)`);
  if (remember) {
    try { window.localStorage.setItem(STORAGE_KEY, name); } catch { /* not remembered */ }
  }
  announce();
  // Once the font file arrives, announce again so the editor re-measures.
  document.fonts?.load(`13px ${font.family}`).then(announce, () => {});
}

function loadStylesheet(font) {
  const id = `cr-font-${font.label.replace(/\W+/g, '-').toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = font.css;
  document.head.appendChild(link);
}

function savedCodeFont() {
  try {
    const name = window.localStorage.getItem(STORAGE_KEY);
    return CODE_FONTS[name] ? name : null;
  } catch {
    return null;
  }
}

function announce() {
  document.dispatchEvent(new CustomEvent('cr-fontchange', { detail: { name: current } }));
}
