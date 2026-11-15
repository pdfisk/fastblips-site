// FastBlips IDE themes, in the manner of a game engine's editor: Graphite,
// Midnight, Ember and Circuit (dark) and Daylight (light). Each is a neutral
// workspace with one accent colour, flat panels, thin borders and a sans-serif
// face, so that what is being made - not the tool - has the colour.
//
// Each theme has:
//   ui     - colour/typography tokens for widgets and windows
//   syntax - editor token colours (BlipPy highlighting)
// applyTheme() writes ui tokens as CSS custom properties (--fb-<name>);
// toMonacoTheme() builds the object for monaco.editor.defineTheme().
//
// Buttons are neutral (button, buttonText, buttonHover); the accent marks what
// is selected or has the focus, and accentText is the text on it. Colours are
// written as #rrggbb (toMonacoTheme needs the hex); test/theme.test.js checks
// that text can be read on what it sits on.

const FONT_UI = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, 'SF Mono', ui-monospace, monospace";
const DARK_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.6)';
const LIGHT_SHADOW = '0 8px 24px rgba(20, 30, 50, 0.22)';

/** Neutral charcoal with a blue accent: the everyday editor. */
export const graphite = {
  id: 'graphite',
  label: 'Graphite',
  dark: true,
  ui: {
    bg:            '#1b1c1f', // the screen behind everything
    surface:       '#17181a', // editors, lists, text panels
    panel:         '#26282c', // rows, columns, tab pages
    titleBar:      '#2f3237',
    titleText:     '#e6e8eb',
    border:        '#3a3d43',
    borderStrong:  '#4d90fe', // focus, split dividers
    text:          '#d6d9de',
    textMuted:     '#8b9099',
    accent:        '#3d8bfd', // what is selected, the active tab
    accentHover:   '#62a3ff',
    accentText:    '#0b1220', // text on the accent
    button:        '#3a3d43', // buttons are neutral
    buttonText:    '#e6e8eb',
    buttonHover:   '#484c53',
    secondary:     '#7aa2f7',
    selection:     '#2b4a78',
    highlight:     '#f2b84b',
    success:       '#5fbf77',
    warning:       '#e6b450',
    danger:        '#e5534b',
    shadow:        DARK_SHADOW,
    radius:        '4px',
    borderWidth:   '1px',
    fontUi:        FONT_UI,
    fontMono:      FONT_MONO,
  },
  syntax: {
    keyword:  '#6cb6ff',
    string:   '#96d0a0',
    number:   '#f2b84b',
    comment:  '#6b7280',
    function: '#dcbdfb',
    type:     '#5fd4c4',
    operator: '#d6d9de',
    error:    '#ff6b6b',
  },
};

/** Deep navy with a cyan accent. */
export const midnight = {
  id: 'midnight',
  label: 'Midnight',
  dark: true,
  ui: {
    bg:            '#0d1420',
    surface:       '#0a101a',
    panel:         '#141d2e',
    titleBar:      '#1b2740',
    titleText:     '#dbe7ff',
    border:        '#263552',
    borderStrong:  '#3fc6e8',
    text:          '#cdd9ee',
    textMuted:     '#7f90ad',
    accent:        '#2cc4e6',
    accentHover:   '#5ad6f2',
    accentText:    '#04121c',
    button:        '#223150',
    buttonText:    '#dbe7ff',
    buttonHover:   '#2d4068',
    secondary:     '#8f9bff',
    selection:     '#1d4160',
    highlight:     '#ffcc66',
    success:       '#5fd39a',
    warning:       '#ffcc66',
    danger:        '#ff6b7a',
    shadow:        DARK_SHADOW,
    radius:        '3px',
    borderWidth:   '1px',
    fontUi:        FONT_UI,
    fontMono:      FONT_MONO,
  },
  syntax: {
    keyword:  '#7fb2ff',
    string:   '#8fe0b0',
    number:   '#ffcc66',
    comment:  '#5d6e8c',
    function: '#5ad6f2',
    type:     '#c3a6ff',
    operator: '#cdd9ee',
    error:    '#ff6b7a',
  },
};

/** Warm near-black with an orange accent, and squarer corners. */
export const ember = {
  id: 'ember',
  label: 'Ember',
  dark: true,
  ui: {
    bg:            '#161413',
    surface:       '#121110',
    panel:         '#221f1d',
    titleBar:      '#2c2825',
    titleText:     '#f1e9e2',
    border:        '#3d3733',
    borderStrong:  '#ff8a3d',
    text:          '#ddd5cd',
    textMuted:     '#968c83',
    accent:        '#ff7a29',
    accentHover:   '#ff9a57',
    accentText:    '#1a0e05',
    button:        '#38322e',
    buttonText:    '#f1e9e2',
    buttonHover:   '#4a423c',
    secondary:     '#e0a070',
    selection:     '#5a3418',
    highlight:     '#ffd166',
    success:       '#8cc265',
    warning:       '#ffb454',
    danger:        '#f0524f',
    shadow:        DARK_SHADOW,
    radius:        '2px',
    borderWidth:   '1px',
    fontUi:        FONT_UI,
    fontMono:      FONT_MONO,
  },
  syntax: {
    keyword:  '#ff9a57',
    string:   '#b5d67a',
    number:   '#ffd166',
    comment:  '#7a7068',
    function: '#79c0ff',
    type:     '#e6b673',
    operator: '#ddd5cd',
    error:    '#f0524f',
  },
};

/** Green-black with a signal-green accent. */
export const circuit = {
  id: 'circuit',
  label: 'Circuit',
  dark: true,
  ui: {
    bg:            '#101614',
    surface:       '#0c1210',
    panel:         '#18211e',
    titleBar:      '#1f2b27',
    titleText:     '#dff3ea',
    border:        '#2c3d37',
    borderStrong:  '#3ddc97',
    text:          '#cfe3da',
    textMuted:     '#7c9489',
    accent:        '#3ddc97',
    accentHover:   '#6be8b2',
    accentText:    '#04140d',
    button:        '#263631',
    buttonText:    '#dff3ea',
    buttonHover:   '#32463f',
    secondary:     '#6fc3df',
    selection:     '#1c4a39',
    highlight:     '#f5d76e',
    success:       '#3ddc97',
    warning:       '#f5d76e',
    danger:        '#ff6b6b',
    shadow:        DARK_SHADOW,
    radius:        '4px',
    borderWidth:   '1px',
    fontUi:        FONT_UI,
    fontMono:      FONT_MONO,
  },
  syntax: {
    keyword:  '#6be8b2',
    string:   '#f5d76e',
    number:   '#ff9e64',
    comment:  '#5c7268',
    function: '#6fc3df',
    type:     '#b8a1ff',
    operator: '#cfe3da',
    error:    '#ff6b6b',
  },
};

/** The light one: cool greys with a blue accent, for a bright room. */
export const daylight = {
  id: 'daylight',
  label: 'Daylight',
  dark: false,
  ui: {
    bg:            '#c9ced6',
    surface:       '#ffffff',
    panel:         '#eef0f3',
    titleBar:      '#d8dce3',
    titleText:     '#1c2330',
    border:        '#b4bac4',
    borderStrong:  '#2563eb',
    text:          '#1c2330',
    textMuted:     '#5d6675',
    accent:        '#2563eb',
    accentHover:   '#1d4ed8',
    accentText:    '#ffffff',
    button:        '#dfe3e9',
    buttonText:    '#1c2330',
    buttonHover:   '#cfd5de',
    secondary:     '#0e7490',
    selection:     '#cfe0ff',
    highlight:     '#d97706',
    success:       '#15803d',
    warning:       '#b45309',
    danger:        '#dc2626',
    shadow:        LIGHT_SHADOW,
    radius:        '4px',
    borderWidth:   '1px',
    fontUi:        FONT_UI,
    fontMono:      FONT_MONO,
  },
  syntax: {
    keyword:  '#1d4ed8',
    string:   '#15803d',
    number:   '#b45309',
    comment:  '#7b8494',
    function: '#7c3aed',
    type:     '#0e7490',
    operator: '#1c2330',
    error:    '#dc2626',
  },
};

export const themes = { graphite, midnight, ember, circuit, daylight };

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** Write a theme's ui tokens onto an element as --fb-* custom properties. */
export function applyTheme(theme, root = document.documentElement) {
  for (const [name, value] of Object.entries(theme.ui)) {
    root.style.setProperty('--fb-' + kebab(name), value);
  }
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}

/** Undo applyTheme(): remove the --fb-* properties and what it set beside them. */
export function clearTheme(root = document.documentElement) {
  for (const theme of Object.values(themes)) {
    for (const name of Object.keys(theme.ui)) root.style.removeProperty('--fb-' + kebab(name));
  }
  delete root.dataset.theme;
  root.style.colorScheme = '';
}

/** Build the data for monaco.editor.defineTheme(theme.id, ...). */
export function toMonacoTheme(theme) {
  const hex = (c) => c.slice(1);
  const { ui, syntax } = theme;
  return {
    base: theme.dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '',           foreground: hex(ui.text) },
      { token: 'keyword',    foreground: hex(syntax.keyword), fontStyle: 'bold' },
      { token: 'string',     foreground: hex(syntax.string) },
      { token: 'number',     foreground: hex(syntax.number) },
      { token: 'comment',    foreground: hex(syntax.comment), fontStyle: 'italic' },
      { token: 'identifier', foreground: hex(ui.text) },
      { token: 'type',       foreground: hex(syntax.type) },
      { token: 'predefined', foreground: hex(syntax.function) },
      { token: 'operator',   foreground: hex(syntax.operator) },
      { token: 'delimiter',  foreground: hex(syntax.operator) },
      { token: 'invalid',    foreground: hex(syntax.error) },
    ],
    colors: {
      'editor.background':                  ui.surface,
      'editor.foreground':                  ui.text,
      'editorLineNumber.foreground':        ui.textMuted,
      'editorLineNumber.activeForeground':  ui.accent,
      'editorCursor.foreground':            ui.accent,
      'editor.selectionBackground':         ui.selection,
      'editor.lineHighlightBackground':     ui.panel,
      'editorGutter.background':            ui.surface,
      'editorError.foreground':             syntax.error,
      'editorWidget.background':            ui.panel,
      'editorWidget.border':                ui.border,
    },
  };
}

// Usage:
//   applyTheme(themes.graphite);
//   monaco.editor.defineTheme('graphite', toMonacoTheme(themes.graphite));
//   monaco.editor.setTheme('graphite');
