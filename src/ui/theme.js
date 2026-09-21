// Theme: every colour, font, radius and shadow the widgets use, as CSS
// custom properties (see docs/widgets.txt, "Theming").
//
// Widgets never hard-code a colour; they refer to a variable, e.g.
// background:var(--cr-title-bg). A theme is a set of values for those
// variables. installTheme() puts all the themes in one <style> element, and
// setTheme() picks one by setting data-cr-theme on <html>:
//
//   setTheme('classic')    the default: a Windows 2000-style desktop
//   setTheme('smalltalk')  black and white, after Smalltalk-80
//   setTheme('light')      the original flat look
//   setTheme('dark')
//   setTheme('auto')       light or dark, following the operating system
//
// Settings > Theme offers Classic and Smalltalk; the choice is remembered in
// localStorage.
//
// A 'cr-themechange' event is dispatched on document whenever the theme in
// effect changes, with detail {name, resolved} ('light' or 'dark'), so parts
// that cannot use CSS variables (the Monaco editor) can follow it.

/** Values shared by every theme: type, shape and sizes. */
const BASE = {
  'font-ui': 'system-ui, -apple-system, "Segoe UI", sans-serif',
  'font-mono': 'ui-monospace, Consolas, "Cascadia Mono", monospace',
  'font-size': '13px',
  'font-size-nav': '14px',
  'font-size-small': '12px',
  'radius-button': '4px',
  'radius-field': '3px',
  'window-radius': '6px',
  // The code font (Settings > Code Font, src/ui/fonts.js) overrides this.
  'font-code': 'var(--cr-font-mono)',
  // How far a console's output pane fades while its program runs.
  'output-running-opacity': '0.6',
  // Shape. The defaults suit a flat theme; Classic and Smalltalk override them.
  'window-padding': '0px',
  'title-font-weight': 'normal',
  'title-label-bg': 'transparent',
  'title-label-padding': '0px',
  'title-label-margin': '0 auto 0 0',   // '0 auto' centres the title
  'tool-bg': 'transparent',
  'tool-shadow': 'none',
  'tool-text': 'inherit',
  'button-bg': 'transparent',
  'button-text': 'inherit',
  'button-shadow': 'none',
  'button-active-shadow': 'none',
  'nav-hover-text': 'inherit',
};

// A raised 3D edge, as on Windows 2000 buttons and window frames.
const BEVEL_RAISED = 'inset -1px -1px #404040, inset 1px 1px #ffffff, '
  + 'inset -2px -2px #808080, inset 2px 2px #d4d0c8';

export const THEMES = {
  light: {
    // The page behind the windows
    'desktop-bg': '#ffffff',
    // Text
    'text': '#111111',
    'text-muted': '#444444',
    'text-faint': '#888888',
    'danger': '#b00020',
    // Accent: selections, highlighted menu items
    'accent': '#3a5f8f',
    'accent-text': '#ffffff',
    // Navbar
    'nav-bg': '#2b3e55',
    'nav-text': '#ffffff',
    'nav-hover': 'rgba(255,255,255,.18)',
    'nav-shadow': '0 1px 3px rgba(0,0,0,.3)',
    // Windows
    'window-bg': '#f4f4f4',
    'window-border': '#888888',
    'window-shadow': '0 8px 24px rgba(0,0,0,.14), 0 2px 6px rgba(0,0,0,.08)',
    'window-shadow-inactive': '0 3px 10px rgba(0,0,0,.10)',
    'title-bg': '#3a5f8f',
    'title-text': '#ffffff',
    'title-bg-inactive': '#9aa7b8',
    'title-text-inactive': '#f3f5f8',
    'title-hover': 'rgba(255,255,255,.25)',
    'close-hover': '#c42b1c',
    'close-hover-text': '#ffffff',
    // Buttons and button bars
    'button-hover': 'rgba(127,127,127,.2)',
    'buttonbar-bg': '#e6e6e6',
    'buttonbar-border': '#c8c8c8',
    // Text areas, lists and fields
    'input-bg': '#ffffff',
    'output-bg': '#f7f7f7',
    'divider': '#d0d0d0',
    'list-selected': '#cfe0f7',
    'list-selected-focus': '#2f6fcf',
    'list-selected-focus-text': '#ffffff',
    'field-border': '#aaaabb',
    'field-disabled-bg': '#f4f4f4',
    'header-bg': '#eef1f5',
    'header-text': '#333333',
    'header-info': '#666666',
    // Menus
    'menu-bg': '#ffffff',
    'menu-text': '#111111',
    'menu-border': '#999999',
    'menu-separator': '#dddddd',
    'menu-shadow': '0 4px 12px rgba(0,0,0,.2)',
    // Status bar
    'status-bg': '#e9ecef',
    'status-border': '#c5cbd3',
    'status-task-bg': '#f8f9fa',
    'status-task-border': '#b8c0ca',
    // The Monaco editor theme to match
    'monaco': 'vs',
  },
  // A Windows 2000-style desktop: grey 3D bevels, gradient title bars,
  // Tahoma, a blue desktop.
  classic: {
    'font-ui': 'Tahoma, "MS Sans Serif", Verdana, sans-serif',
    'font-mono': 'Consolas, "Courier New", monospace',
    'font-size': '12px',
    'font-size-nav': '12px',
    'font-size-small': '11px',
    'radius-button': '0px',
    'radius-field': '0px',
    'desktop-bg': '#3a6ea5',
    'text': '#000000',
    'text-muted': '#222222',
    'text-faint': '#808080',
    'danger': '#c00000',
    'accent': '#0a246a',
    'accent-text': '#ffffff',
    'nav-bg': '#d4d0c8',
    'nav-text': '#000000',
    'nav-hover': '#0a246a',
    'nav-hover-text': '#ffffff',
    'nav-shadow': '0 1px 0 #808080, 0 2px 0 #ffffff',
    'window-bg': '#d4d0c8',
    'window-border': '#d4d0c8',
    'window-padding': '3px',
    'window-radius': '4px',
    'window-shadow': `${BEVEL_RAISED}, 0 6px 18px rgba(0,0,0,.22)`,
    'window-shadow-inactive': `${BEVEL_RAISED}, 0 2px 8px rgba(0,0,0,.14)`,
    'title-bg': 'linear-gradient(to right, #0a246a, #a6caf0)',
    'title-text': '#ffffff',
    'title-bg-inactive': 'linear-gradient(to right, #808080, #c0c0c0)',
    'title-text-inactive': '#d4d0c8',
    'title-font-weight': 'bold',
    'title-hover': '#e4e1db',
    'close-hover': '#e4e1db',
    'close-hover-text': '#000000',
    'tool-bg': '#d4d0c8',
    'tool-text': '#000000',
    'tool-shadow': 'inset -1px -1px #404040, inset 1px 1px #ffffff, inset -2px -2px #808080',
    'button-bg': '#d4d0c8',
    'button-text': '#000000',
    'button-shadow': BEVEL_RAISED,
    'button-active-shadow': 'inset 1px 1px #404040, inset -1px -1px #ffffff, inset 2px 2px #808080',
    'button-hover': '#dedad2',
    'buttonbar-bg': '#d4d0c8',
    'buttonbar-border': '#d4d0c8',
    'input-bg': '#ffffff',
    'output-bg': '#ffffff',
    'divider': '#d4d0c8',
    'list-selected': '#d4d0c8',
    'list-selected-focus': '#0a246a',
    'list-selected-focus-text': '#ffffff',
    'field-border': '#808080',
    'field-disabled-bg': '#d4d0c8',
    'header-bg': '#d4d0c8',
    'header-text': '#000000',
    'header-info': '#404040',
    'menu-bg': '#d4d0c8',
    'menu-text': '#000000',
    'menu-border': '#808080',
    'menu-separator': '#808080',
    'menu-shadow': '1px 1px 0 #404040, 2px 2px 3px rgba(0,0,0,.25)',
    'status-bg': '#d4d0c8',
    'status-border': '#ffffff',
    'status-task-bg': '#d4d0c8',
    'status-task-border': '#808080',
    'monaco': 'vs',
  },
  // After Smalltalk-80: black on white, striped title bars with the title
  // centred on a white label, hard drop shadows, a dithered grey desktop.
  smalltalk: {
    'font-ui': 'Geneva, Verdana, "DejaVu Sans", sans-serif',
    'font-mono': 'Monaco, "Courier New", monospace',
    'font-size': '12px',
    'font-size-nav': '13px',
    'font-size-small': '11px',
    'radius-button': '0px',
    'radius-field': '0px',
    'desktop-bg': 'repeating-conic-gradient(#8c8c8c 0 25%, #d6d6d6 0 50%) 0 0 / 4px 4px',
    'text': '#000000',
    'text-muted': '#000000',
    'text-faint': '#8c8c8c',
    'danger': '#000000',
    'accent': '#000000',
    'accent-text': '#ffffff',
    'nav-bg': '#ffffff',
    'nav-text': '#000000',
    'nav-hover': '#000000',
    'nav-hover-text': '#ffffff',
    'nav-shadow': '0 1px 0 #000000',
    'window-bg': '#ffffff',
    'window-border': '#000000',
    'window-radius': '5px',
    'window-shadow': '2px 4px 12px rgba(0,0,0,.28)',
    'window-shadow-inactive': '1px 2px 5px rgba(0,0,0,.18)',
    'title-bg': 'repeating-linear-gradient(to bottom, #ffffff 0 2px, #000000 2px 3px)',
    'title-text': '#000000',
    'title-bg-inactive': '#ffffff',
    'title-text-inactive': '#8c8c8c',
    'title-font-weight': 'bold',
    'title-label-bg': '#ffffff',
    'title-label-padding': '0 8px',
    'title-label-margin': '0 auto',
    'title-hover': '#000000',
    'close-hover': '#000000',
    'close-hover-text': '#ffffff',
    'tool-bg': '#ffffff',
    'tool-text': '#000000',
    'tool-shadow': 'inset 0 0 0 1px #000000',
    'button-bg': '#ffffff',
    'button-text': '#000000',
    'button-shadow': 'inset 0 0 0 1px #000000',
    'button-active-shadow': 'inset 0 0 0 2px #000000',
    'button-hover': '#e6e6e6',
    'buttonbar-bg': '#ffffff',
    'buttonbar-border': '#000000',
    'input-bg': '#ffffff',
    'output-bg': '#ffffff',
    'divider': '#b4b4b4',
    'list-selected': '#d6d6d6',
    'list-selected-focus': '#000000',
    'list-selected-focus-text': '#ffffff',
    'field-border': '#000000',
    'field-disabled-bg': '#eeeeee',
    'header-bg': '#ffffff',
    'header-text': '#000000',
    'header-info': '#000000',
    'menu-bg': '#ffffff',
    'menu-text': '#000000',
    'menu-border': '#000000',
    'menu-separator': '#8c8c8c',
    'menu-shadow': '2px 2px 0 #000000',
    'status-bg': '#ffffff',
    'status-border': '#000000',
    'status-task-bg': '#ffffff',
    'status-task-border': '#000000',
    'monaco': 'vs',
  },
  dark: {
    'desktop-bg': '#1b1e23',
    'text': '#e4e6ea',
    'text-muted': '#b4bac4',
    'text-faint': '#7d8591',
    'danger': '#ff6b6b',
    'accent': '#4f86c6',
    'accent-text': '#ffffff',
    'nav-bg': '#15181d',
    'nav-text': '#e4e6ea',
    'nav-hover': 'rgba(255,255,255,.12)',
    'nav-shadow': '0 1px 0 rgba(255,255,255,.06)',
    'window-bg': '#252a31',
    'window-border': '#3b424d',
    'window-shadow': '0 10px 28px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3)',
    'window-shadow-inactive': '0 3px 10px rgba(0,0,0,.3)',
    'title-bg': '#34567f',
    'title-text': '#ffffff',
    'title-bg-inactive': '#2e343d',
    'title-text-inactive': '#9aa3af',
    'title-hover': 'rgba(255,255,255,.18)',
    'close-hover': '#c42b1c',
    'close-hover-text': '#ffffff',
    'button-hover': 'rgba(255,255,255,.1)',
    'buttonbar-bg': '#2b3038',
    'buttonbar-border': '#3b424d',
    'input-bg': '#1e1e1e',
    'output-bg': '#23272e',
    'divider': '#3b424d',
    'list-selected': '#2f4058',
    'list-selected-focus': '#3a6db0',
    'list-selected-focus-text': '#ffffff',
    'field-border': '#4a5260',
    'field-disabled-bg': '#2b3038',
    'header-bg': '#2b3038',
    'header-text': '#c9ced6',
    'header-info': '#8d95a1',
    'menu-bg': '#2b3038',
    'menu-text': '#e4e6ea',
    'menu-border': '#454c58',
    'menu-separator': '#3b424d',
    'menu-shadow': '0 6px 16px rgba(0,0,0,.5)',
    'status-bg': '#15181d',
    'status-border': '#2e343d',
    'status-task-bg': '#252a31',
    'status-task-border': '#3b424d',
    'monaco': 'vs-dark',
  },
};

/** The theme a first visit starts with. */
export const DEFAULT_THEME = 'classic';

/** The themes offered in Settings > Theme, as [name, label]. */
export const MENU_THEMES = [['classic', 'Classic'], ['smalltalk', 'Smalltalk']];

const STORAGE_KEY = 'crumb.theme';

function savedTheme() {
  try {
    const name = window.localStorage.getItem(STORAGE_KEY);
    return name === 'auto' || THEMES[name] ? name : null;
  } catch {
    return null;   // storage blocked: use the default
  }
}

const declarations = (values) => Object.entries(values)
  .map(([name, value]) => `--cr-${name}:${value};`).join('');

/** Adds the theme variables to the page. Safe to call more than once. */
export function installTheme() {
  if (typeof document === 'undefined' || document.getElementById('cr-theme-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-theme-style';
  style.textContent = [
    `:root{${declarations(BASE)}${declarations(THEMES.light)}}`,
    ...Object.entries(THEMES).map(([name, values]) => `:root[data-cr-theme="${name}"]{${declarations(values)}}`),
    `@media (prefers-color-scheme: dark){:root[data-cr-theme="auto"]{${declarations(THEMES.dark)}}}`,
  ].join('\n');
  document.head.prepend(style);   // first, so later styles can override
  if (!document.documentElement.dataset.crTheme) {
    document.documentElement.dataset.crTheme = savedTheme() ?? DEFAULT_THEME;
  }
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => { if (themeName() === 'auto') announce(); });
}

/** The theme chosen: 'light', 'dark' or 'auto'. */
export function themeName() {
  return (typeof document !== 'undefined' && document.documentElement.dataset.crTheme) || DEFAULT_THEME;
}

/** The theme in effect: 'auto' resolved to 'light' or 'dark'. */
export function resolvedTheme() {
  const name = themeName();
  if (name !== 'auto') return name;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches theme ('classic', 'smalltalk', 'light', 'dark' or 'auto') and
 *  remembers the choice for the next visit. */
export function setTheme(name) {
  if (name !== 'auto' && !THEMES[name]) throw new Error(`unknown theme '${name}'`);
  installTheme();
  document.documentElement.dataset.crTheme = name;
  try { window.localStorage.setItem(STORAGE_KEY, name); } catch { /* not remembered */ }
  announce();
}

/** The value of a theme variable in effect, e.g. themeValue('monaco'). */
export function themeValue(name) {
  return THEMES[resolvedTheme()]?.[name] ?? BASE[name];
}

function announce() {
  document.dispatchEvent(new CustomEvent('cr-themechange', {
    detail: { name: themeName(), resolved: resolvedTheme() },
  }));
}
