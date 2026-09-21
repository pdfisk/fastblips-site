// Theme: every colour, font, radius and shadow the widgets use, as CSS
// custom properties (see docs/widgets.txt, "Theming").
//
// Widgets never hard-code a colour; they refer to a variable, e.g.
// background:var(--cr-title-bg). A theme is a set of values for those
// variables. installTheme() puts all the themes in one <style> element, and
// setTheme() picks one by setting data-cr-theme on <html>:
//
//   setTheme('light')   the default
//   setTheme('dark')
//   setTheme('auto')    follows the operating system (prefers-color-scheme)
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
};

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
    'window-shadow': '0 4px 16px rgba(0,0,0,.25)',
    'window-shadow-inactive': '0 2px 8px rgba(0,0,0,.15)',
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
    'window-shadow': '0 6px 20px rgba(0,0,0,.55)',
    'window-shadow-inactive': '0 2px 8px rgba(0,0,0,.4)',
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
  if (!document.documentElement.dataset.crTheme) document.documentElement.dataset.crTheme = 'light';
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => { if (themeName() === 'auto') announce(); });
}

/** The theme chosen: 'light', 'dark' or 'auto'. */
export function themeName() {
  return (typeof document !== 'undefined' && document.documentElement.dataset.crTheme) || 'light';
}

/** The theme in effect: 'auto' resolved to 'light' or 'dark'. */
export function resolvedTheme() {
  const name = themeName();
  if (name !== 'auto') return name;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches theme: 'light', 'dark' or 'auto'. */
export function setTheme(name) {
  if (name !== 'auto' && !THEMES[name]) throw new Error(`unknown theme '${name}'`);
  installTheme();
  document.documentElement.dataset.crTheme = name;
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
