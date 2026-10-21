// The GUI designer's code generator: a composite (the node tree of
// designer-model.js) in, the Crumb or MiniPy program that builds it out. No
// DOM here, so it is tested under Node; DesignerCodeWindow
// (windows/designer-code-window.js) shows the result.
//
// The tree stays the source of truth. The program has a marked layout
// section that is rebuilt from the design, and handler stubs (a Sub in
// Crumb, a function in MiniPy) for every event the design names. updateCode()
// regenerates the layout section of a program you have already edited,
// leaves the rest as it is, and adds only the stubs that are missing.
//
// Both languages are driven by one table (LANGUAGES): the spelling of a
// constructor, a method, a string, a Boolean, a handler. The method names
// are the camelCase ones of src/vm/runtime/widgets.js; MiniPy gets its
// snake_case spelling from snakeCase() there.

import { WIDGET_CLASSES, snakeCase } from '../vm/runtime/widgets.js';
import { KEYWORDS as CRUMB_KEYWORDS, BUILTINS as CRUMB_BUILTINS } from '../vm/compiler/basic/tokens.js';
import { KEYWORDS as PY_KEYWORDS } from '../vm/compiler/python/tokens.js';
import { BUILTIN_NAMES as PY_BUILTINS } from '../vm/runtime/python-builtins.js';
import { childrenOf, eventsOf } from './designer-model.js';
import { DEFAULT_BOXES, DEFAULT_WINDOW_BOUNDS } from './widget-defaults.js';

// ---- literals ---------------------------------------------------------------

const num = (n) => String(Number.isInteger(n) ? n : Math.round(n * 1e6) / 1e6);

/** A Crumb String literal. `""` is a quote; there are no escapes or multiline
 *  strings, so a control character (a new line, a tab) becomes & Chr(n) &. */
export function crumbString(value) {
  const parts = [];
  let text = '';
  const flush = () => { if (text) { parts.push(`"${text.replaceAll('"', '""')}"`); text = ''; } };
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    if (code < 32 || code === 127) { flush(); parts.push(`Chr(${code})`); } else text += ch;
  }
  flush();
  return parts.length ? parts.join(' & ') : '""';
}

/** A MiniPy string literal. MiniPy has \n, \t, \\, \" and \0 and no chr(),
 *  so any other control character (a text box cannot hold one) is dropped. */
export function pyString(value) {
  let out = '';
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (code < 32 || code === 127) continue;
    else out += ch;
  }
  return `"${out}"`;
}

// ---- the spelling table -----------------------------------------------------

const lower = (names) => new Set([...names].map((n) => n.toLowerCase()));

/** Words that cannot be a variable or a handler name (any case). `vp` is the Viewport. */
const CLASS_NAMES = new Set(WIDGET_CLASSES.map((c) => c.name));
const CRUMB_RESERVED = lower([...CRUMB_KEYWORDS, ...CRUMB_BUILTINS, 'vp']);
const PY_RESERVED = lower([...PY_KEYWORDS, ...PY_BUILTINS.filter((n) => !CLASS_NAMES.has(n)), 'vp']);
// A widget class has a namespace of its own in Crumb. In MiniPy it is a name
// like any other, so a variable must not be spelled exactly like one.
const PY_RESERVED_EXACT = CLASS_NAMES;

export const LANGUAGES = Object.freeze({
  basic: Object.freeze({
    id: 'basic',
    title: 'Basic',
    comment: "'",
    monaco: 'vb',
    reserved: CRUMB_RESERVED,
    reservedExact: new Set(),
    string: crumbString,
    bool: (v) => (v ? 'True' : 'False'),
    method: (name) => name,
    construct: (cls, args) => `New ${cls}(${args.join(', ')})`,
    declare: (name, expr) => `Dim ${name} = ${expr}`,
    handlerRef: (name) => crumbString(name),
    // Words to a handler name made up for a menu item: OpenFile.
    handlerFromWords: (words) => words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'MenuItem',
    stub: (name, params, note) => [`Sub ${name}(${params.join(', ')})`, `  ' ${note}`, 'End Sub'],
    stubsFirst: false,   // a Sub can be used before it is defined
  }),
  python: Object.freeze({
    id: 'python',
    title: 'Python',
    comment: '#',
    monaco: 'python',
    reserved: PY_RESERVED,
    reservedExact: PY_RESERVED_EXACT,
    string: pyString,
    bool: (v) => (v ? 'True' : 'False'),
    method: snakeCase,
    construct: (cls, args) => `${cls}(${args.join(', ')})`,
    declare: (name, expr) => `${name} = ${expr}`,
    handlerRef: (name) => name,
    handlerFromWords: (words) => words.map((w) => w.toLowerCase()).join('_') || 'menu_item',
    stub: (name, params, note) => [`def ${name}(${params.join(', ')}):`, `    pass  # ${note}`],
    stubsFirst: true,    // a function must be defined before a call names it
  }),
});

const language = (id) => {
  const lang = LANGUAGES[id];
  if (!lang) throw new Error(`there is no language '${id}': the languages are ${Object.keys(LANGUAGES).join(', ')}`);
  return lang;
};

// ---- names ------------------------------------------------------------------

/** text as an identifier: letters, digits and underscores, not starting with a digit. */
function identOf(text) {
  const id = String(text).replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+$/, '');
  if (id === '') return 'x';
  return /^[0-9]/.test(id) ? `x${id}` : id;
}

/** What a widget's variable is called when its id does not say: a Button is button1. */
const VARIABLE_BASES = {
  Label: 'label', Button: 'button', Menu: 'menu', Spacer: 'spacer', Panel: 'panel', HPanel: 'row', VPanel: 'column',
  ButtonBar: 'buttons', HSplitPanel: 'split', VSplitPanel: 'split', TabPanel: 'tabs', Window: 'win',
  TextPanel: 'text', MonacoPanel: 'editor', ListPanel: 'list',
};

/** The first parameter of every handler is the widget; then the event's values. */
const VALUE_PARAMS = { int: 'index', number: 'value', text: 'text' };

const MARK = '=====';
const BEGIN = (lang) => `${lang.comment} ${MARK} DESIGNER LAYOUT (generated: edit the design, not this) ${MARK}`;
const END = (lang) => `${lang.comment} ${MARK} END DESIGNER LAYOUT ${MARK}`;
const BEGIN_PATTERN = /^[ \t]*['#] =+ DESIGNER LAYOUT\b/;
const END_PATTERN = /^[ \t]*['#] =+ END DESIGNER LAYOUT\b/;

/** Per class and event: the parameter names for the values it passes ('handler:int' -> ['index']). */
const EVENT_VALUES = Object.fromEntries(WIDGET_CLASSES.map((c) => [c.name, Object.fromEntries(
  c.methods.filter((m) => /^on[A-Z]/.test(m.name) && m.params.length === 1 && m.params[0].startsWith('handler'))
    .map((m) => [m.name, m.params[0].split(':').slice(1).map((k) => VALUE_PARAMS[k] ?? 'value')]))]));

// ---- the generator ----------------------------------------------------------

class Generator {
  constructor(lang) {
    this.lang = lang;
    this.lines = [];
    this.used = new Set(lang.reserved);     // lowercase names taken
    this.counts = new Map();
    this.handlers = new Map();              // lowercase name -> { name, values, who }
  }

  line(text) { this.lines.push(text); }

  /** Takes a name no one else has (names are case-insensitive): wanted, or wanted2, wanted3... */
  claim(wanted) {
    let name = wanted;
    for (let i = 2; this.taken(name); i += 1) name = `${wanted}${i}`;
    this.used.add(name.toLowerCase());
    return name;
  }

  taken(name) { return this.used.has(name.toLowerCase()) || this.lang.reservedExact.has(name); }

  /** A name for a parameter: free of every variable and handler, without taking it. */
  free(wanted, taken) {
    let name = wanted;
    for (let i = 2; this.taken(name) || taken.has(name.toLowerCase()); i += 1) name = `${wanted}${i}`;
    return name;
  }

  variable(node, root) {
    if (node.id) return this.claim(identOf(node.id));
    if (root) return this.claim(node.class === 'Window' ? 'win' : 'root');
    const base = VARIABLE_BASES[node.class] ?? identOf(node.class).toLowerCase();
    const n = (this.counts.get(base) ?? 0) + 1;
    this.counts.set(base, n);
    return this.claim(`${base}${n}`);
  }

  /**
   * Reserves the names of every handler in the design before any variable is
   * named: a handler's name is what the design (and a saved composite) calls
   * it, so a variable gives way to it, not the other way round. Crumb keeps
   * Subs and variables in one namespace; MiniPy does the same for functions.
   */
  reserveHandlers(node) {
    if (node.class === 'Menu') {
      for (const item of node.items ?? []) if (!item?.separator) this.reserve(this.menuHandler(node, item));
    }
    const known = new Set(eventsOf(node.class));
    for (const event of node.events ?? []) if (event?.handler && known.has(event.method)) this.reserve(String(event.handler));
    for (const child of childrenOf(node)) this.reserveHandlers(child);
  }

  reserve(wanted) {
    const key = wanted.toLowerCase();
    if (!this.handlers.has(key)) this.handlers.set(key, { name: this.claim(identOf(wanted)), values: [], who: [] });
  }

  /** A menu item's handler: the one the design names, else one made from the menu's and the item's words. */
  menuHandler(menu, item) {
    return item.handler || this.lang.handlerFromWords(
      `${menu.text || menu.id || 'menu'} ${item.label ?? ''}`.split(/[^A-Za-z0-9]+/).filter(Boolean));
  }

  /** Records that a reserved handler is wired here: its stub takes the widget, then `values` (parameter names). */
  useHandler(wanted, values, who) {
    const handler = this.handlers.get(wanted.toLowerCase());
    if (values.length > handler.values.length) handler.values = values;
    handler.who.push(who);
    return handler.name;
  }

  call(variable, method, args = []) {
    this.line(`${variable}.${this.lang.method(method)}(${args.join(', ')})`);
  }

  str(text) { return this.lang.string(text ?? ''); }

  // ---- one widget

  /**
   * Writes the statements that make node and everything in it, and returns
   * its variable. parent is its parent node (null for the root); bar is the
   * variable of a Window's button bar when node sits in it.
   */
  build(node, parent, { root = false, bar = null } = {}) {
    const cls = node.class;
    const v = this.variable(node, root);
    const L = this.lang;
    const text = () => this.str(node.text);

    if (bar && cls === 'Button') {
      this.line(L.declare(v, `${bar}.${L.method('addButton')}(${text()})`));
    } else {
      const args = {
        Label: [text()], Button: [text()], Menu: [text()], TextPanel: [text()],
        MonacoPanel: [text(), this.str(node.language || 'plaintext')],
        Window: [this.str(node.title)],
      }[cls] ?? [];
      this.line(L.declare(v, L.construct(cls, args)));
    }

    if (node.id) this.call(v, 'setId', [this.str(node.id)]);
    this.place(v, node, parent);
    if (node.visible === false && parent?.class !== 'TabPanel') this.call(v, 'setVisible', [L.bool(false)]);
    if (node.background) this.call(v, 'setBackground', [this.str(node.background)]);
    if (node.color) this.call(v, 'setColor', [this.str(node.color)]);

    this.specifics(v, node);
    this.events(v, node);
    this.children(v, node);
    return v;
  }

  /** Where it sits and how big it is: its box where placed freely, else its fixed size. */
  place(v, node, parent) {
    const cls = node.class;
    if (cls === 'Window') {
      const b = node.bounds ?? DEFAULT_WINDOW_BOUNDS;
      if (b.some((x, i) => x !== DEFAULT_WINDOW_BOUNDS[i])) this.call(v, 'setBounds', b.map(num));
      return;
    }
    const free = !parent || parent.class === 'Panel';
    const dflt = DEFAULT_BOXES[cls] ?? [0, 0, 0, 0];
    if (free) {
      const box = node.box ?? dflt;
      const bounds = [box[0], box[1], node.width ?? box[2], node.height ?? box[3]];
      if (bounds.some((x, i) => x !== dflt[i])) this.call(v, 'setBounds', bounds.map(num));
    } else {
      if (node.width !== undefined) this.call(v, 'setWidth', [num(node.width)]);
      if (node.height !== undefined) this.call(v, 'setHeight', [num(node.height)]);
    }
    if (node.flex !== undefined) this.call(v, 'setFlex', [num(node.flex)]);
    if (node.fill === true) this.call(v, 'fill');
  }

  /** What only some classes have: padding, items, the divider, ... */
  specifics(v, node) {
    const L = this.lang;
    switch (node.class) {
      case 'Button': if (node.enabled === false) this.call(v, 'setEnabled', [L.bool(false)]); break;
      case 'TextPanel': case 'MonacoPanel': if (node.readOnly) this.call(v, 'setReadOnly', [L.bool(true)]); break;
      case 'HPanel': case 'VPanel':
        if (Number.isFinite(node.padding)) this.call(v, 'setPadding', [num(node.padding)]);
        if (Number.isFinite(node.spacing)) this.call(v, 'setSpacing', [num(node.spacing)]);
        break;
      case 'HSplitPanel': case 'VSplitPanel':
        if (Number.isFinite(node.position)) this.call(v, 'setPosition', [num(node.position)]);
        break;
      case 'ListPanel': {
        const items = node.items ?? [];
        if (node.emptyText) this.call(v, 'setEmptyText', [this.str(node.emptyText)]);
        for (const item of items) this.call(v, 'addItem', [this.str(item)]);
        if (Number.isInteger(node.selected) && node.selected >= 0 && node.selected < items.length) {
          this.call(v, 'select', [num(node.selected)]);
        }
        break;
      }
      case 'Menu': this.menuItems(v, node); break;
      default: break;
    }
  }

  menuItems(v, node) {
    const L = this.lang;
    for (const item of node.items ?? []) {
      if (item?.separator) { this.call(v, 'addSeparator'); continue; }
      const label = String(item?.label ?? '');
      // A handler is required, so an item the design leaves without one gets
      // a stub named for the menu and the item: File, Open -> FileOpen.
      const name = this.useHandler(this.menuHandler(node, { ...item, label }), ['label'], `${v}.${L.method('addItem')}`);
      this.call(v, 'addItem', [this.str(label), L.handlerRef(name)]);
    }
  }

  events(v, node) {
    const known = new Set(eventsOf(node.class));
    for (const event of node.events ?? []) {
      if (!event?.handler) continue;
      if (!known.has(event.method)) {
        this.line(`${this.lang.comment} ${v} has no event ${event.method}: ${event.handler} not wired`);
        continue;
      }
      const values = EVENT_VALUES[node.class]?.[event.method] ?? [];
      const name = this.useHandler(String(event.handler), values, `${v}.${this.lang.method(event.method)}`);
      this.call(v, event.method, [this.lang.handlerRef(name)]);
    }
  }

  children(v, node) {
    const L = this.lang;
    const into = (child, how, options) => {
      if (child.class === 'Window') { this.line(`${L.comment} a Window cannot go inside another widget: skipped`); return; }
      const c = this.build(child, node, options);
      if (how) how(c);
    };
    switch (node.class) {
      case 'Panel': case 'HPanel': case 'VPanel': case 'ButtonBar':
        for (const child of node.children ?? []) into(child, (c) => this.call(v, 'add', [c]));
        break;
      case 'HSplitPanel': case 'VSplitPanel':
        if (node.first) into(node.first, (c) => this.call(v, 'setFirst', [c]));
        if (node.second) into(node.second, (c) => this.call(v, 'setSecond', [c]));
        break;
      case 'TabPanel':
        for (const tab of node.tabs ?? []) {
          if (tab?.widget) into(tab.widget, (c) => this.call(v, 'addTab', [this.str(tab.label), c]));
        }
        if (Number.isInteger(node.selected) && node.selected > 0 && node.selected < (node.tabs ?? []).length) {
          this.call(v, 'select', [num(node.selected)]);
        }
        break;
      case 'Window': {
        if (node.content) into(node.content, (c) => this.call(v, 'setContent', [c]));
        const bar = node.buttonBar;
        if (bar && (bar.children ?? []).length > 0) {
          const b = this.claim(bar.id ? identOf(bar.id) : 'buttonBar');
          this.line(L.declare(b, `${v}.${L.method('getButtonBar')}()`));
          if (bar.id) this.call(b, 'setId', [this.str(bar.id)]);
          for (const child of bar.children) {
            into(child, child.class === 'Button' ? null : (c) => this.call(b, 'add', [c]), { bar: b });
          }
        }
        break;
      }
      default: break;
    }
  }
}

// ---- the program ------------------------------------------------------------

/** The pieces of the program: its layout lines and its handler stubs. */
function parts(root, { language: id = 'basic', name = '' } = {}) {
  if (!root || typeof root !== 'object' || !root.class) throw new Error('there is no design to generate code from');
  const lang = language(id);
  const g = new Generator(lang);
  g.reserveHandlers(root);
  g.line(lang.declare('vp', lang.construct('Viewport', [])));
  g.line('');
  const v = g.build(root, null, { root: true });
  if (root.class === 'Window') {
    g.call(v, 'open');
    if (root.maximized) g.call(v, 'maximize');
  } else {
    g.call('vp', 'add', [v]);
  }

  const stubs = [...g.handlers.values()].map((h) => {
    const taken = new Set();
    const params = ['sender', ...h.values].map((p) => {
      const free = g.free(p, taken);
      taken.add(free.toLowerCase());
      return free;
    });
    const note = `Runs on ${h.who.join(', ')}: add your code here.`;
    return { name: h.name, lines: lang.stub(h.name, params, note) };
  });
  return { lang, layout: g.lines, stubs, name: String(name).replace(/[\r\n]+/g, ' ') };
}

const stubText = (stubs) => stubs.flatMap((s, i) => (i ? ['', ...s.lines] : s.lines));

/**
 * The program that builds root: a header, the layout section, and a stub for
 * every handler the design names (before the layout in MiniPy, which needs a
 * function defined before it is named; after it in Crumb).
 * @param {object} root - the design (a node of designer-model.js)
 * @param {{language?: 'basic'|'python', name?: string}} [options]
 */
export function generateCode(root, options = {}) {
  const { lang, layout, stubs, name } = parts(root, options);
  const header = [
    `${lang.comment} Generated by the FastBlips Designer${name ? ` from "${name}"` : ''}.`,
    `${lang.comment} The layout section is rebuilt from the design: put your own code outside it.`,
    '',
  ];
  const section = [BEGIN(lang), ...layout, END(lang)];
  const body = lang.stubsFirst
    ? [...header, ...(stubs.length ? [...stubText(stubs), ''] : []), ...section]
    : [...header, ...section, ...(stubs.length ? ['', ...stubText(stubs)] : [])];
  return `${body.join('\n')}\n`;
}

/** True when a Sub or function called name is defined in source. */
function defines(source, lang, name) {
  const word = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = lang.id === 'python' ? `^[ \\t]*def[ \\t]+${word}\\b` : `^[ \\t]*(?:Sub|Function)[ \\t]+${word}\\b`;
  return new RegExp(pattern, 'im').test(source);
}

/**
 * Regenerates the layout section of a program that was generated before and
 * edited since: the section between the markers is replaced, everything else
 * is kept, and a stub is added for each handler the program does not define.
 * Without the markers there is nothing to replace, so the result is the
 * whole generated program and `merged` is false.
 * @returns {{text: string, merged: boolean, added: string[]}} the handlers added
 */
export function updateCode(existing, root, options = {}) {
  const { lang, layout, stubs } = parts(root, options);
  const lines = String(existing).replace(/\r\n?/g, '\n').split('\n');
  const begin = lines.findIndex((l) => BEGIN_PATTERN.test(l));
  const end = lines.findIndex((l, i) => i > begin && END_PATTERN.test(l));
  if (begin < 0 || end < 0) {
    return { text: generateCode(root, options), merged: false, added: stubs.map((s) => s.name) };
  }
  const missing = stubs.filter((s) => !defines(existing, lang, s.name));
  let before = lines.slice(0, begin);
  let after = lines.slice(end + 1);
  if (missing.length) {
    if (lang.stubsFirst) {
      while (before.length && before[before.length - 1] === '') before.pop();
      before = [...before, '', ...stubText(missing), ''];
    } else {
      while (after.length && after[after.length - 1] === '') after.pop();
      after = [...after, '', ...stubText(missing)];
    }
  }
  const text = [...before, BEGIN(lang), ...layout, END(lang), ...after].join('\n');
  return { text: text.endsWith('\n') ? text : `${text}\n`, merged: true, added: missing.map((s) => s.name) };
}

// ---- saving ---------------------------------------------------------------------

/**
 * Saves the design's program as a script. A new name makes a new script. A
 * name that is already a script of this language, made by the designer,
 * gets its layout section regenerated: the code written around it is kept
 * and the handlers it lacks are added. Any other script of that name is left
 * alone (it was not made here, or has lost its markers), with an Error.
 * @param {object} store - a SourceStore of the scripts in the user's space
 * @param {{name: string, root: object, language?: 'basic'|'python'}} options
 * @returns {Promise<{action: 'created'|'updated', script: object, added: string[]}>}
 */
export async function saveAsScript(store, { name, root, language: id = 'basic' }) {
  const lang = language(id);
  const wanted = String(name ?? '').trim();
  if (!wanted) throw new Error('A name is required');
  const found = (await store.findByName(wanted)).find((s) => String(s.name).toLowerCase() === wanted.toLowerCase());
  if (!found) {
    const content = generateCode(root, { language: id, name: wanted });
    return { action: 'created', script: await store.create({ name: wanted, language: id, content }), added: [] };
  }
  if (found.language !== id) {
    throw new Error(`"${found.name}" is already a ${LANGUAGES[found.language]?.title ?? found.language} script: choose another name`);
  }
  const merged = updateCode(found.content ?? '', root, { language: id, name: wanted });
  if (!merged.merged) {
    throw new Error(`"${found.name}" has no Designer layout section to update (was it written by hand?): choose another name`);
  }
  // The compiled code no longer matches the source.
  const script = await store.update(found.id, { content: merged.text, compiled_code: null });
  return { action: 'updated', script, added: merged.added };
}
