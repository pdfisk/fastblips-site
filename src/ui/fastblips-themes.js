// FastBlips IDE themes: Steampunk (dark) and Pokemon-inspired (light).
//
// Each theme has:
//   ui     - colour/typography tokens for widgets and windows
//   syntax - editor token colours (shared by Crumb and MiniPy highlighting)
// applyTheme() writes ui tokens as CSS custom properties (--fb-<name>);
// toMonacoTheme() builds the object for monaco.editor.defineTheme().

export const steampunk = {
  id: 'steampunk',
  label: 'Steampunk',
  dark: true,
  ui: {
    bg:            '#1e1710', // dark walnut: the screen behind everything
    surface:       '#2a2016', // editors, lists, text panels
    panel:         '#35281a', // rows, columns, tab pages
    titleBar:      '#4a3319', // mahogany window title bars
    titleText:     '#f0dfb8',
    border:        '#6b4f2a', // aged bronze
    borderStrong:  '#a67c3d', // polished brass edge (focus, split dividers)
    text:          '#e8d9b8', // parchment
    textMuted:     '#a8946c',
    accent:        '#c8923a', // brass: buttons, selected tab
    accentHover:   '#e0aa4e',
    accentText:    '#1e1710',
    secondary:     '#4f8a80', // verdigris: links, secondary buttons
    selection:     '#5a4220',
    highlight:     '#d98a5f', // copper
    success:       '#8fa858',
    warning:       '#e0aa4e',
    danger:        '#d0603f', // rust
    shadow:        '0 6px 18px rgba(0, 0, 0, 0.55)',
    radius:        '3px',
    borderWidth:   '1px',
    fontUi:        "Rockwell, 'Roboto Slab', Georgia, serif",
    fontMono:      "'Courier Prime', 'Courier New', ui-monospace, monospace",
  },
  syntax: {
    keyword:  '#d9a441',
    string:   '#9fbf7a',
    number:   '#d98a5f',
    comment:  '#7d6c50',
    function: '#6fb3a8',
    type:     '#c9b27c',
    operator: '#e8d9b8',
    error:    '#d0603f',
  },
};

export const pokemon = {
  id: 'pokemon',
  label: 'Pokemon',
  dark: false,
  ui: {
    bg:            '#f4f5f0', // off-white
    surface:       '#ffffff',
    panel:         '#eaeef6',
    titleBar:      '#e3350d', // red top half
    titleText:     '#ffffff',
    border:        '#2a2a2a', // bold black outline
    borderStrong:  '#000000',
    text:          '#1d1d1f',
    textMuted:     '#5f6672',
    accent:        '#e3350d', // red: primary buttons
    accentHover:   '#ff4b22',
    accentText:    '#ffffff',
    secondary:     '#3b5ca8', // blue: links, secondary buttons
    selection:     '#ffe680', // pale yellow
    highlight:     '#ffcb05', // yellow: selected tab, focus ring
    success:       '#3f9a4d', // grass
    warning:       '#b07a00',
    danger:        '#a3123f',
    shadow:        '3px 3px 0 #2a2a2a', // flat, hard-edged
    radius:        '10px',
    borderWidth:   '2px',
    fontUi:        "'Nunito', 'Trebuchet MS', system-ui, sans-serif",
    fontMono:      "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  },
  syntax: {
    keyword:  '#c62d0a', // fire
    string:   '#2f7d3a', // grass
    number:   '#2a56b0', // water
    comment:  '#7c828c',
    function: '#7a4fc0', // psychic
    type:     '#8f6200', // electric, darkened for contrast
    operator: '#1d1d1f',
    error:    '#a3123f',
  },
};

export const themes = { steampunk, pokemon };

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
//   applyTheme(themes.steampunk);
//   monaco.editor.defineTheme('steampunk', toMonacoTheme(themes.steampunk));
//   monaco.editor.setTheme('steampunk');
