// The GUI designer's model: a composite widget as a tree of plain nodes,
// in the same form the widget host saves (toJson, saveComposite; see
// docs/viewports-server.md), and the edits the designer makes to it. No
// DOM here, so it is tested under Node; DesignerWindow
// (windows/designer-window.js) shows and edits it.
//
// A node is { class, id?, ...fields }. Its children live in different
// places by class: children (Panel, HPanel, VPanel, ButtonBar, Composite,
// Stack), first /
// second (the split panels), tabs[i].widget (TabPanel), content and
// buttonBar.children (Window). slots() gives them one shape.

import { WIDGET_CLASSES } from '../vm/runtime/widgets.js';
import {
  DEFAULT_BOXES, DEFAULT_WINDOW_BOUNDS, DEFAULT_LAYOUTS, LAYOUT_CLASSES,
} from './widget-defaults.js';
import { makeLayout, cleanChildProps } from './layouts/index.js';
import { FITS, checkImageSource } from './widgets/image.js';
import { SIDES } from './widgets/drawer.js';

/** The classes the designer offers: every widget class but the singletons (the Viewport, the Board, the Canvas and the Physics). */
export const PALETTE = WIDGET_CLASSES.map((c) => c.name).filter((n) => !['Viewport', 'Board', 'Canvas', 'Physics'].includes(n)).sort((a, b) => a.localeCompare(b));

const LIST_CONTAINERS = new Set(['Panel', 'HPanel', 'VPanel', 'ButtonBar', 'Composite', 'Stack', 'CheckGroupBox', 'RadioGroupBox', 'Carousel', 'Drawer']);
const SPLITS = new Set(['HSplitPanel', 'VSplitPanel']);

/** The layout of a Composite or group box node: its name (the class's own, 'basic' or 'vbox', when none is saved). */
export const layoutOf = (node) => node.layout ?? DEFAULT_LAYOUTS[node.class] ?? 'basic';

/** True when node holds its children as a plain list. */
export const isList = (node) => LIST_CONTAINERS.has(node.class);

/**
 * True when node places its children where each one's box says (a Panel, or a
 * Composite with a basic or canvas layout): they have a left and a top of
 * their own, and can be dragged.
 */
export const isFreeParent = (node) => node.class === 'Panel'
  || (LAYOUT_CLASSES.has(node.class) && ['basic', 'canvas'].includes(layoutOf(node)));

/** True when node lays its children out along a row (so a drop goes to the left or right of a child). */
export const isHorizontal = (node) => node.class === 'HPanel' || node.class === 'ButtonBar'
  || (LAYOUT_CLASSES.has(node.class) && ['hbox', 'flow'].includes(layoutOf(node)));

/** A new node of a class, with the defaults a program's New would give it. */
export function newNode(cls) {
  if (!PALETTE.includes(cls)) throw new Error(`there is no widget class '${cls}'`);
  const node = { class: cls };
  switch (cls) {
    case 'Label': case 'Button': case 'Menu': case 'SplitButton': node.text = cls; break;
    case 'TextPanel': case 'TextArea': node.text = ''; break;
    case 'MonacoPanel': node.text = ''; node.language = 'vb'; break;
    case 'Window': node.title = 'Window'; node.bounds = [...DEFAULT_WINDOW_BOUNDS]; break;
    case 'ListPanel': case 'SelectBox': node.items = []; break;
    case 'TabPanel': node.tabs = []; break;
    case 'Image': node.source = ''; break;
    case 'CheckGroupBox': case 'RadioGroupBox': node.text = 'Group'; break;
    case 'TextField': node.text = ''; break;   // a PasswordField has no text to keep
    case 'NavigationBar': node.title = 'Title'; break;
    default: break;
  }
  if (cls === 'Menu' || cls === 'SplitButton') node.items = [];
  if (LIST_CONTAINERS.has(cls)) node.children = [];
  if (SPLITS.has(cls)) { node.position = 0.5; node.first = null; node.second = null; }
  if (DEFAULT_BOXES[cls]) node.box = [...DEFAULT_BOXES[cls]];
  return node;
}

/**
 * The places a node holds children, in order: [{ get, set, label }] where
 * get() is the child node or null. List containers and tabs also have
 * insert(i, node) and remove(i) on the slot list itself.
 */
export function slots(node) {
  if (LIST_CONTAINERS.has(node.class)) {
    return (node.children ??= []).map((_, i) => ({ get: () => node.children[i], index: i }));
  }
  if (SPLITS.has(node.class)) {
    return [
      { get: () => node.first ?? null, set: (n) => { node.first = n; }, label: 'first' },
      { get: () => node.second ?? null, set: (n) => { node.second = n; }, label: 'second' },
    ];
  }
  if (node.class === 'TabPanel') {
    return (node.tabs ??= []).map((tab, i) => ({ get: () => tab.widget, index: i, label: tab.label }));
  }
  if (node.class === 'Window') {
    const bar = node.buttonBar?.children ?? [];
    return [
      { get: () => node.content ?? null, set: (n) => { node.content = n; }, label: 'content' },
      ...bar.map((_, i) => ({ get: () => node.buttonBar.children[i], index: i, label: 'button bar', bar: true })),
    ];
  }
  return [];
}

/** The child nodes of a node, in order. */
export const childrenOf = (node) => slots(node).map((s) => s.get()).filter(Boolean);

/** True when node can hold another child. */
export function canAdd(node) {
  if (LIST_CONTAINERS.has(node.class) || node.class === 'TabPanel' || node.class === 'Window') return true;
  if (SPLITS.has(node.class)) return !node.first || !node.second;
  return false;
}

/** The node's parent in the tree under root, or null. */
export function parentOf(root, node) {
  for (const child of childrenOf(root)) {
    if (child === node) return root;
    const found = parentOf(child, node);
    if (found) return found;
  }
  return null;
}

/**
 * Adds child to parent: at the end of a list container, as a new tab, in
 * a split panel's empty side, as a Window's content (or, once it has one, to
 * its button bar). Returns a message saying why not, or null.
 */
export function addChild(parent, child) {
  if (child.class === 'Window') return 'a Window floats on the screen: it can only be the root';
  if (LIST_CONTAINERS.has(parent.class)) { (parent.children ??= []).push(child); return null; }
  if (parent.class === 'TabPanel') {
    (parent.tabs ??= []).push({ label: `Tab ${parent.tabs.length + 1}`, widget: child });
    return null;
  }
  if (SPLITS.has(parent.class)) {
    if (!parent.first) { parent.first = child; return null; }
    if (!parent.second) { parent.second = child; return null; }
    return `a ${parent.class} holds two widgets, and both sides are taken`;
  }
  if (parent.class === 'Window') {
    if (!parent.content) { parent.content = child; return null; }
    parent.buttonBar ??= { class: 'ButtonBar', children: [] };
    (parent.buttonBar.children ??= []).push(child);
    return null;
  }
  return `a ${parent.class} cannot hold other widgets`;
}

/**
 * Adds child to parent like addChild, but at position index of a list
 * container (a number from 0; past the end, or undefined, is the end). Other
 * parents take it where addChild would. Returns a message saying why not, or null.
 */
export function insertChild(parent, child, index) {
  if (LIST_CONTAINERS.has(parent.class) && child.class !== 'Window') {
    const list = (parent.children ??= []);
    list.splice(index === undefined ? list.length : Math.max(0, Math.min(index, list.length)), 0, child);
    return null;
  }
  return addChild(parent, child);
}

/** True when node is ancestor, or somewhere under it. */
export function isWithin(node, ancestor) {
  return node === ancestor || childrenOf(ancestor).some((c) => isWithin(node, c));
}

/** Where node sits in parent: { list, index } for lists, or { slot } for a named side. */
function placeOf(parent, node) {
  if (LIST_CONTAINERS.has(parent.class)) return { list: parent.children, index: parent.children.indexOf(node) };
  if (parent.class === 'TabPanel') return { list: parent.tabs, index: parent.tabs.findIndex((t) => t.widget === node), tabs: true };
  if (SPLITS.has(parent.class)) return { slot: parent.first === node ? 'first' : 'second' };
  if (parent.class === 'Window') {
    if (parent.content === node) return { slot: 'content' };
    return { list: parent.buttonBar.children, index: parent.buttonBar.children.indexOf(node) };
  }
  return null;
}

/** Removes node from the tree under root. The root itself cannot go. */
export function removeNode(root, node) {
  const parent = parentOf(root, node);
  if (!parent) return 'the root cannot be deleted: start a New composite instead';
  const place = placeOf(parent, node);
  if (place.list) place.list.splice(place.index, 1);
  else parent[place.slot] = null;
  return null;
}

/**
 * Moves node (with everything in it) under newParent, at position index if
 * that is a list container (see insertChild). It can go to another parent or
 * to another place under the same one. Returns a message saying why not, or
 * null; nothing changes when there is a message.
 */
export function moveNodeTo(root, node, newParent, index) {
  if (node === root) return 'the root cannot be moved';
  if (isWithin(newParent, node)) return 'a widget cannot go inside itself';
  const parent = parentOf(root, node);
  if (!parent) return 'that widget is not in the design';
  const place = placeOf(parent, node);
  const removed = place.list ? place.list[place.index] : null;
  if (place.list) place.list.splice(place.index, 1); else parent[place.slot] = null;
  let at = index;
  if (place.list && !place.tabs && parent === newParent && at !== undefined && place.index < at) at -= 1;
  const problem = insertChild(newParent, node, at);
  if (problem) {
    if (place.list) place.list.splice(place.index, 0, removed); else parent[place.slot] = node;
    return problem;
  }
  return null;
}

/** Moves node one place earlier (delta -1) or later (+1) among its siblings. */
export function moveNode(root, node, delta) {
  const parent = parentOf(root, node);
  if (!parent) return 'the root has no siblings';
  const place = placeOf(parent, node);
  if (place.slot && SPLITS.has(parent.class)) {
    [parent.first, parent.second] = [parent.second, parent.first];
    return null;
  }
  if (!place.list) return 'it has nowhere to move';
  const to = place.index + delta;
  if (to < 0 || to >= place.list.length) return 'it is already at the end';
  const [item] = place.list.splice(place.index, 1);
  place.list.splice(to, 0, item);
  return null;
}

/** A short description of a node for the outline: VPanel #form, Button "OK". */
export function describe(node) {
  let text = node.class;
  if (node.id) text += ` #${node.id}`;
  const caption = node.class === 'Window' ? node.title : node.text;
  if (caption !== undefined && caption !== '' && ['Label', 'Button', 'Menu', 'SplitButton', 'Window', 'CheckGroupBox', 'RadioGroupBox'].includes(node.class)) {
    text += ` "${String(caption).split('\n')[0]}"`;
  }
  return text;
}

/** The tree under root, depth first: [{ node, depth, text }]. */
export function outline(root) {
  const rows = [];
  const walk = (node, depth, prefix = '') => {
    rows.push({ node, depth, text: `${'    '.repeat(depth)}${prefix}${describe(node)}` });
    for (const s of slots(node)) {
      const child = s.get();
      if (!child) continue;
      const label = node.class === 'TabPanel' ? `[${s.label}] `
        : SPLITS.has(node.class) ? `(${s.label}) `
          : s.bar ? '(button bar) ' : '';
      walk(child, depth + 1, label);
    }
  };
  walk(root, 0);
  return rows;
}

// ---- fields: what the inspector edits ------------------------------------
//
// A field is { key, label, type, get(node), set(node, value) }. type:
//   text    a one-line string       number  a number, or '' to clear
//   lines   several lines           bool    a check box
//   event   a handler's name (a Sub, or a BlipPy function)

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const blank = (v) => v === undefined || v === null || v === '';

function boxField(key, label, i) {
  const fixed = key === 'width' ? 'width' : key === 'height' ? 'height' : null;
  return {
    key, label, type: 'number',
    get: (n) => (fixed && n[fixed] !== undefined ? n[fixed] : n.box?.[i] ?? ''),
    set: (n, v) => {
      const value = num(v);
      n.box ??= [...(DEFAULT_BOXES[n.class] ?? [0, 0, 0, 0])];
      if (value === undefined) {
        if (fixed) delete n[fixed];         // back to its natural size in a row or column
        return;
      }
      if (!Number.isFinite(value)) throw new Error(`${label} must be a number`);
      if (fixed && value < 0) throw new Error(`${label} must be 0 or more`);
      n.box[i] = Math.round(value);
      if (fixed) n[fixed] = Math.round(value);
    },
  };
}

function boundsField(key, label, i) {
  return {
    key, label, type: 'number',
    get: (n) => n.bounds?.[i] ?? DEFAULT_WINDOW_BOUNDS[i],
    set: (n, v) => {
      const value = num(v);
      if (value === undefined || !Number.isFinite(value)) throw new Error(`${label} must be a number`);
      n.bounds ??= [...DEFAULT_WINDOW_BOUNDS];
      n.bounds[i] = Math.round(value);
    },
  };
}

const prop = (key, label, type, dflt) => ({
  key, label, type,
  get: (n) => n[key] ?? dflt,
  set: (n, v) => {
    if (type === 'number') {
      const value = num(v);
      if (value === undefined) { delete n[key]; return; }
      if (!Number.isFinite(value)) throw new Error(`${label} must be a number`);
      n[key] = value;
    } else if (type === 'bool') {
      if (v === dflt) delete n[key]; else n[key] = v;
    } else if (blank(v) && dflt === undefined) {
      delete n[key];
    } else {
      n[key] = v;
    }
  },
});

/**
 * A size on the sides of a widget (margin, padding, border width), written as in
 * CSS: one number for all four sides, two for top and bottom then left and
 * right, three for top, left and right, then bottom, or four for top, right,
 * bottom and left. It is kept as one number when the sides are alike, else as
 * [top, right, bottom, left]. '' clears it.
 */
const sidesField = (key, label) => ({
  key, label, type: 'text',
  get: (n) => (n[key] === undefined ? '' : [].concat(n[key]).join(' ')),
  set: (n, v) => {
    const words = String(v).split(/[\s,]+/).filter(Boolean);
    if (words.length === 0) { delete n[key]; return; }
    const values = words.map(Number);
    if (words.length > 4 || values.some((x) => !Number.isFinite(x) || x < 0)) {
      throw new Error(`${label} must be 1 to 4 numbers of 0 or more (all sides; top/bottom left/right; top left/right bottom; top right bottom left)`);
    }
    const [a, b = a, c = a, d = b] = values.map(Math.round);
    const sides = words.length === 1 ? [a, a, a, a]
      : words.length === 2 ? [a, b, a, b]
        : words.length === 3 ? [a, b, c, b]
          : [a, b, c, d];
    n[key] = sides.every((x) => x === sides[0]) ? sides[0] : sides;
  },
});

const lines = (text) => String(text).split('\n').map((l) => l.replace(/\r$/, ''));

// ---- layout fields: a Composite's layout and where a child sits in it

/**
 * A setting of a Composite's layout, kept in node.layoutOptions: the layout
 * itself checks the value, and a value that is the layout's default is not
 * kept. '' goes back to the default.
 */
function optionField(key, label, type) {
  return {
    key: `layoutOptions.${key}`, label, type,
    get: (n) => n.layoutOptions?.[key] ?? makeLayout(layoutOf(n)).defaults[key] ?? '',
    set: (n, v) => {
      const layout = makeLayout(layoutOf(n));
      const dflt = layout.defaults[key];
      const value = type === 'number' ? (num(v) ?? dflt) : type === 'bool' ? Boolean(v) : (blank(v) ? dflt : String(v).trim().toLowerCase());
      layout.set(key, value);
      const options = { ...(n.layoutOptions ?? {}) };
      if (layout.options[key] === dflt) delete options[key]; else options[key] = layout.options[key];
      if (Object.keys(options).length) n.layoutOptions = options; else delete n.layoutOptions;
    },
  };
}

/** A grid's columns or rows: one line each, `index flex=1 size=80 min=20 max=200`. */
const tracksField = (axis) => ({
  key: `layoutOptions.${axis}s`, label: `${axis[0].toUpperCase()}${axis.slice(1)}s: index flex= size= min= max= (one a line)`, type: 'lines',
  get: (n) => Object.entries(n.layoutOptions?.[`${axis}s`] ?? {})
    .map(([i, t]) => `${i} ${Object.entries(t).map(([k, x]) => `${k}=${x}`).join(' ')}`).join('\n'),
  set: (n, v) => {
    const layout = makeLayout(layoutOf(n));
    for (const line of lines(v).map((l) => l.trim()).filter(Boolean)) {
      const [index, ...pairs] = line.split(/\s+/);
      for (const pair of pairs) {
        const [k, x] = pair.split('=');
        layout.setTrack(axis, Number(index), k, Number(x));
      }
    }
    const options = { ...(n.layoutOptions ?? {}) };
    if (Object.keys(layout[`${axis}s`]).length) options[`${axis}s`] = layout[`${axis}s`]; else delete options[`${axis}s`];
    if (Object.keys(options).length) n.layoutOptions = options; else delete n.layoutOptions;
  },
});

/** Which layout a Composite uses; changing it drops the settings of the old one. */
const layoutField = {
  key: 'layout', label: 'Layout', type: 'text',
  get: (n) => layoutOf(n),
  set: (n, v) => {
    const dflt = DEFAULT_LAYOUTS[n.class] ?? 'basic';
    const name = String(v).trim().toLowerCase() || dflt;
    makeLayout(name);   // says which layouts there are, when there is none of this name
    if (name === layoutOf(n)) return;
    if (name === dflt) delete n.layout; else n.layout = name;
    delete n.layoutOptions;
  },
};

/** A widget's own setting in its parent's layout, kept in node.layoutProps; '' clears it. */
function childField(key, label, type, dflt) {
  return {
    key: `layoutProps.${key}`, label, type,
    get: (n) => n.layoutProps?.[key] ?? dflt ?? '',
    set: (n, v) => {
      const next = { ...(n.layoutProps ?? {}) };
      const value = blank(v) ? undefined : cleanChildProps({ [key]: type === 'number' ? Number(v) : String(v).trim().toLowerCase() })[key];
      if (value === undefined || value === dflt) delete next[key]; else next[key] = value;
      if (Object.keys(next).length) n.layoutProps = next; else delete n.layoutProps;
    },
  };
}

/** The canvas edges and size of a child: six lengths separated by commas. */
const canvasField = {
  key: 'layoutProps.canvas', label: 'Edges (left, top, right, bottom, width, height)', type: 'text',
  get: (n) => (n.layoutProps?.canvas ?? []).join(', '),
  set: (n, v) => {
    const next = { ...(n.layoutProps ?? {}) };
    if (blank(v)) delete next.canvas;
    else {
      const parts = String(v).split(',').map((x) => x.trim());
      const clean = cleanChildProps({ canvas: parts }).canvas;
      if (clean.every((x) => x === '')) delete next.canvas; else next.canvas = clean;
    }
    if (Object.keys(next).length) n.layoutProps = next; else delete n.layoutProps;
  },
};

const LAYOUT_OPTION_FIELDS = {
  spacing: optionField('spacing', 'Spacing', 'number'),
  spacingX: optionField('spacingX', 'Spacing across', 'number'),
  spacingY: optionField('spacingY', 'Spacing down', 'number'),
  alignX: optionField('alignX', 'Align the group (left, center, right)', 'text'),
  alignY: optionField('alignY', 'Align the group (top, middle, bottom)', 'text'),
  reversed: optionField('reversed', 'Reversed', 'bool'),
};

/** The fields for a Composite's layout settings: its layout, then that layout's settings. */
function layoutFields(node) {
  const layout = makeLayout(layoutOf(node));
  const own = Object.keys(layout.defaults).map((key) => LAYOUT_OPTION_FIELDS[key]);
  return [layoutField, ...own, ...(layout.kind === 'grid' ? [tracksField('column'), tracksField('row')] : [])];
}

/** The fields for a widget's place in its parent Composite's layout. */
function placeFields(parent) {
  const kind = layoutOf(parent);
  const align = { x: childField('alignX', 'Align across (left, center, right)', 'text'), y: childField('alignY', 'Align across (top, middle, bottom)', 'text') };
  switch (kind) {
    case 'dock': return [childField('edge', 'Edge (north, south, west, east, center)', 'text')];
    case 'grid': return [
      childField('row', 'Row', 'number', 0), childField('column', 'Column', 'number', 0),
      childField('rowSpan', 'Rows covered', 'number', 1), childField('columnSpan', 'Columns covered', 'number', 1),
      align.x, align.y,
    ];
    case 'hbox': case 'flow': return [align.y];
    case 'vbox': return [align.x];
    case 'canvas': return [canvasField];
    default: return [];
  }
}

const FIELDS = {
  id: prop('id', 'Id', 'text'),
  text: prop('text', 'Text', 'text', ''),
  textArea: prop('text', 'Text', 'lines', ''),
  title: prop('title', 'Title', 'text', ''),
  language: prop('language', 'Language', 'text', 'plaintext'),
  enabled: prop('enabled', 'Enabled', 'bool', true),
  readOnly: prop('readOnly', 'Read only', 'bool', false),
  visible: prop('visible', 'Visible', 'bool', true),
  fill: prop('fill', 'Fill its area', 'bool', false),
  maximized: prop('maximized', 'Maximized', 'bool', false),
  flex: prop('flex', 'Flex', 'number'),
  margin: sidesField('margin', 'Margin'),
  padding: sidesField('padding', 'Padding'),
  border: sidesField('borderWidth', 'Border width'),
  borderColor: prop('borderColor', 'Border colour', 'text'),
  borderWidth: prop('borderWidth', 'Outline width', 'number', 2),
  outlineColor: prop('borderColor', 'Outline colour', 'text'),
  radius: prop('radius', 'Corner radius', 'number', 12),
  spacing: prop('spacing', 'Spacing', 'number'),
  source: {
    key: 'source', label: 'Source (http, https or data:image address)', type: 'text',
    get: (n) => n.source ?? '',
    set: (n, v) => { n.source = checkImageSource(v); },
  },
  fit: {
    key: 'fit', label: `Fit (${FITS.join(', ')})`, type: 'text',
    get: (n) => n.fit ?? 'contain',
    set: (n, v) => {
      const fit = String(v).trim().toLowerCase();
      if (fit === '' || fit === 'contain') { delete n.fit; return; }
      if (!FITS.includes(fit)) throw new Error(`a fit must be one of ${FITS.join(', ')}, not '${v}'`);
      n.fit = fit;
    },
  },
  alt: prop('alt', 'Alt text', 'text', ''),
  checkedOn: prop('checked', 'Checked', 'bool', true),
  checkedOff: prop('checked', 'Checked', 'bool', false),
  group: prop('group', 'Group', 'text', ''),
  placeholder: prop('placeholder', 'Placeholder', 'text', ''),
  maxLength: prop('maxLength', 'Max length (0 for none)', 'number'),
  wrap: prop('wrap', 'Wrap lines', 'bool', true),
  backText: prop('backText', 'Back button text (empty for none)', 'text', ''),
  actionText: prop('actionText', 'Action button text (empty for none)', 'text', ''),
  dots: prop('dots', 'Page dots', 'bool', true),
  side: {
    key: 'side', label: `Side (${SIDES.join(', ')})`, type: 'text',
    get: (n) => n.side ?? 'left',
    set: (n, v) => {
      const side = String(v).trim().toLowerCase();
      if (side === '' || side === 'left') { delete n.side; return; }
      if (!SIDES.includes(side)) throw new Error(`a side must be one of ${SIDES.join(', ')}, not '${v}'`);
      n.side = side;
    },
  },
  panelSize: prop('panelSize', 'Panel size (pixels)', 'number'),
  open: prop('open', 'Open', 'bool', false),
  dismissOnTap: prop('dismissOnTap', 'Close on tap outside', 'bool', true),
  position: prop('position', 'Divider (0-1)', 'number'),
  selected: prop('selected', 'Selected', 'number'),
  emptyText: prop('emptyText', 'Empty text', 'text'),
  background: prop('background', 'Background', 'text'),
  color: prop('color', 'Colour', 'text'),
  left: boxField('left', 'Left', 0),
  top: boxField('top', 'Top', 1),
  width: boxField('width', 'Width', 2),
  height: boxField('height', 'Height', 3),
  winLeft: boundsField('left', 'Left', 0),
  winTop: boundsField('top', 'Top', 1),
  winWidth: boundsField('width', 'Width', 2),
  winHeight: boundsField('height', 'Height', 3),
  listItems: {
    key: 'items', label: 'Items (one a line)', type: 'lines',
    get: (n) => (n.items ?? []).join('\n'),
    set: (n, v) => { n.items = v === '' ? [] : lines(v); },
  },
  menuItems: {
    key: 'items', label: 'Items: Label = Handler, - for a line', type: 'lines',
    get: (n) => (n.items ?? []).map((i) => (i.separator ? '-' : i.handler ? `${i.label} = ${i.handler}` : i.label)).join('\n'),
    set: (n, v) => {
      n.items = (v === '' ? [] : lines(v)).filter((l) => l.trim() !== '').map((l) => {
        if (l.trim() === '-') return { separator: true };
        const at = l.lastIndexOf('=');
        const label = (at < 0 ? l : l.slice(0, at)).trim();
        const handler = at < 0 ? '' : l.slice(at + 1).trim();
        return handler ? { label, handler } : { label, handler: null };
      });
    },
  },
  tabLabels: {
    key: 'tabs', label: 'Tab labels (one a line)', type: 'lines',
    get: (n) => (n.tabs ?? []).map((t) => t.label).join('\n'),
    set: (n, v) => {
      const labels = lines(v);
      (n.tabs ?? []).forEach((t, i) => { if (labels[i] !== undefined && labels[i] !== '') t.label = labels[i]; });
    },
  },
};

/** An event field: the name of the handler for method (onClick, ...). */
function eventField(method) {
  return {
    key: method, label: method, type: 'event',
    get: (n) => (n.events ?? []).find((e) => e.method === method)?.handler ?? '',
    set: (n, v) => {
      const name = String(v).trim();
      n.events = (n.events ?? []).filter((e) => e.method !== method);
      if (name) n.events.push({ method, handler: name });
      if (n.events.length === 0) delete n.events;
    },
  };
}

/** The events a class has: its methods whose argument is a handler (Menu items aside). */
export function eventsOf(cls) {
  const c = WIDGET_CLASSES.find((k) => k.name === cls);
  return (c?.methods ?? [])
    .filter((m) => /^on[A-Z]/.test(m.name) && m.params.length === 1 && m.params[0].startsWith('handler'))
    .map((m) => m.name);
}

// Which classes have which of the box fields. A margin works on any widget
// but a Window and a Spacer. A border and padding are drawn by the widget
// itself, so only on those whose contents sit inside them: a Panel's children
// are placed by its box (a border pushes them in), but only a row, a column, a
// Label or a Button have padding. A shape's outline is its border (see above).
const NO_MARGIN = new Set(['Window', 'Spacer']);
const BORDERED = new Set(['Label', 'Button', 'TextPanel', 'ListPanel', 'Panel', 'HPanel', 'VPanel', 'Composite', 'Stack', 'Image', 'CheckGroupBox', 'RadioGroupBox']);
const PADDED = new Set(['Label', 'Button', 'HPanel', 'VPanel', 'Composite', 'Stack', 'CheckGroupBox', 'RadioGroupBox', 'Drawer']);

function boxFields(cls) {
  const f = FIELDS;
  return [
    ...(NO_MARGIN.has(cls) ? [] : [f.margin]),
    ...(BORDERED.has(cls) ? [f.border, f.borderColor] : []),
    ...(PADDED.has(cls) ? [f.padding] : []),
  ];
}

/** The fields the inspector shows for a node, in groups: [[title, fields]]. */
export function fieldsFor(node, { isRoot = false, parent = null } = {}) {
  const f = FIELDS;
  const cls = node.class;
  const own = {
    Label: [f.text], Button: [f.text, f.enabled], Menu: [f.text, f.menuItems],
    TextPanel: [f.textArea, f.readOnly], MonacoPanel: [f.textArea, f.language, f.readOnly],
    ListPanel: [f.listItems, f.selected, f.emptyText],
    HPanel: [f.spacing], VPanel: [f.spacing],
    Ellipse: [f.borderWidth, f.outlineColor], RoundedRect: [f.borderWidth, f.outlineColor, f.radius],
    HSplitPanel: [f.position], VSplitPanel: [f.position],
    TabPanel: [f.tabLabels, f.selected],
    Stack: [f.selected],
    Image: [f.source, f.fit, f.alt],
    CheckGroupBox: [f.text, f.checkedOn],
    RadioGroupBox: [f.text, f.group, f.checkedOff],
    TextField: [f.text, f.placeholder, f.maxLength, f.readOnly, f.enabled],
    PasswordField: [f.placeholder, f.maxLength, f.readOnly, f.enabled],
    TextArea: [f.textArea, f.placeholder, f.maxLength, f.readOnly, f.enabled, f.wrap],
    SelectBox: [f.listItems, f.selected, f.enabled],
    SplitButton: [f.text, f.enabled, f.menuItems],
    NavigationBar: [f.title, f.backText, f.actionText],
    Carousel: [f.selected, f.dots],
    Drawer: [f.side, f.panelSize, f.open, f.dismissOnTap],
    Window: [f.title, f.maximized],
  }[cls] ?? [];
  const groups = [['Widget', [f.id, ...own]]];
  if (cls === 'Window') {
    groups.push(['Place', [f.winLeft, f.winTop, f.winWidth, f.winHeight]]);
  } else if (cls !== 'Drawer') {   // a Drawer covers the area of its container: it has no place of its own
    const free = isRoot || !parent || isFreeParent(parent);
    groups.push(['Place', free
      ? [f.left, f.top, f.width, f.height, f.fill]
      : [f.width, f.height, f.flex]]);
  }
  if (LAYOUT_CLASSES.has(cls)) groups.push([`Layout (${layoutOf(node)})`, layoutFields(node)]);
  if (cls !== 'Window' && LAYOUT_CLASSES.has(parent?.class)) {
    const place = placeFields(parent);
    if (place.length) groups.push([`In the ${layoutOf(parent)} layout`, place]);
  }
  const box = boxFields(cls);
  if (box.length) groups.push(['Box (margin, border, padding)', box]);
  groups.push(['Look', [f.visible, f.background, f.color]]);
  const events = eventsOf(cls).map(eventField);
  if (events.length) groups.push(['Events (handler names)', events]);
  return groups;
}

/** Reads a field. */
export const getField = (node, field) => field.get(node);

/** Sets a field; throws an Error whose message says what is wrong. */
export function setField(node, field, value) { field.set(node, value); }

/** The document the designer saves (the widget host's composite format). */
export function toDoc(root) {
  return { format: 'fastblip-viewport', version: 1, kind: 'composite', root };
}

/** A deep copy of a node (for undo and paste). */
export const cloneNode = (node) => JSON.parse(JSON.stringify(node));

const idsUnder = (node, ids = new Set()) => {
  if (node.id) ids.add(node.id);
  for (const c of childrenOf(node)) idsUnder(c, ids);
  return ids;
};

/** Renames ids in node (a copy about to join the tree under root) that the tree already uses: save -> save2. */
export function makeIdsUnique(root, node) {
  const taken = idsUnder(root);
  const walk = (n) => {
    if (n.id) {
      let id = n.id;
      for (let i = 2; taken.has(id); i += 1) id = `${n.id}${i}`;
      n.id = id;
      taken.add(id);
    }
    for (const c of childrenOf(n)) walk(c);
  };
  walk(node);
}

/**
 * Pastes a copy of `copied` into the tree under root: inside `selected` if that
 * can hold it, else right after it in its parent. The copy gets ids no other
 * widget has, and where it lands in a Panel it is offset a little so that it
 * does not hide the original. Returns { node } (the copy that was added), or
 * { problem } saying why not; nothing changes with a problem.
 */
export function pasteNode(root, selected, copied) {
  const node = cloneNode(copied);
  let parent = selected;
  let after = null;
  if (!canAdd(parent)) { after = parent; parent = parentOf(root, parent); }
  if (!parent) return { problem: `a ${selected.class} cannot hold other widgets` };
  makeIdsUnique(root, node);
  const list = LIST_CONTAINERS.has(parent.class) ? parent.children : null;
  const index = after && list ? list.indexOf(after) + 1 : undefined;
  const problem = insertChild(parent, node, index);
  if (problem) return { problem };
  if (isFreeParent(parent) && node.box) { node.box[0] += 12; node.box[1] += 12; }
  return { node };
}

// ---- the palette, in groups ------------------------------------------------

const GROUPS = [
  ['Layout', ['VPanel', 'HPanel', 'Panel', 'Composite', 'Stack', 'TabPanel', 'HSplitPanel', 'VSplitPanel', 'Spacer']],
  ['Text and buttons', ['Label', 'Button', 'SplitButton', 'Menu', 'ButtonBar']],
  ['Input', ['TextField', 'PasswordField', 'TextArea', 'SelectBox', 'CheckGroupBox', 'RadioGroupBox', 'ListPanel']],
  ['Display', ['Image', 'TextPanel', 'MonacoPanel', 'Ellipse', 'RoundedRect']],
  ['Phone', ['NavigationBar', 'Carousel', 'Drawer']],
  ['Windows', ['Window']],
];

/**
 * The Palette's classes by what they are for: [[title, [class, ...]], ...].
 * A class no group names (one added to the toolkit since) is in a last
 * group, Other, so that it is never left out.
 */
export const PALETTE_GROUPS = (() => {
  const named = new Set(GROUPS.flatMap(([, classes]) => classes));
  const groups = GROUPS.map(([title, classes]) => [title, classes.filter((c) => PALETTE.includes(c))]);
  const other = PALETTE.filter((c) => !named.has(c));
  if (other.length) groups.push(['Other', other]);
  return groups.filter(([, classes]) => classes.length);
})();

/**
 * The Palette's rows for a search: [{ label, value }] where value is a
 * class, or null for a group's heading. With text, only the classes whose
 * name contains it (any case) are left, and the groups that still have one.
 */
export function paletteRows(search = '') {
  const want = String(search).trim().toLowerCase();
  const rows = [];
  for (const [title, classes] of PALETTE_GROUPS) {
    const found = classes.filter((c) => c.toLowerCase().includes(want));
    if (!found.length) continue;
    rows.push({ label: title.toUpperCase(), value: null });
    for (const c of found) rows.push({ label: `    ${c}`, value: c });
  }
  return rows;
}

// ---- undo and redo ---------------------------------------------------------

/**
 * The designs the designer has been through, for Undo and Redo. A state is
 * any JSON-ready value (the designer keeps { root, selected }); the History
 * keeps its own copies. reset(state) starts again from a state; record(state)
 * adds the state after an edit (and forgets what could be redone); undo()
 * and redo() return the state to show, or null when there is none.
 */
export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.states = [];
    this.at = -1;
  }

  reset(state) {
    this.states = [JSON.stringify(state)];
    this.at = 0;
  }

  record(state) {
    const text = JSON.stringify(state);
    if (this.at >= 0 && this.states[this.at] === text) return false;
    this.states.length = this.at + 1;
    this.states.push(text);
    if (this.states.length > this.limit) this.states.shift();
    this.at = this.states.length - 1;
    return true;
  }

  get canUndo() { return this.at > 0; }
  get canRedo() { return this.at < this.states.length - 1; }

  undo() {
    if (!this.canUndo) return null;
    this.at -= 1;
    return JSON.parse(this.states[this.at]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.at += 1;
    return JSON.parse(this.states[this.at]);
  }
}

// ---- several widgets at once: aligning, spacing, snapping --------------------

/** A freely placed node's box as { x, y, width, height }. */
export function rectOf(node) {
  const box = node.box ?? DEFAULT_BOXES[node.class] ?? [0, 0, 0, 0];
  return { x: box[0], y: box[1], width: node.width ?? box[2], height: node.height ?? box[3] };
}

function moveTo(node, x, y) {
  node.box ??= [...(DEFAULT_BOXES[node.class] ?? [0, 0, 0, 0])];
  node.box[0] = Math.round(x);
  node.box[1] = Math.round(y);
}

/**
 * The parent the nodes share when every one of them is placed freely in it
 * (a Panel, or a Composite with a basic or canvas layout), else null: only
 * such widgets have a left and a top to align.
 */
export function sharedFreeParent(root, nodes) {
  if (!nodes.length) return null;
  const parent = parentOf(root, nodes[0]);
  if (!parent || !isFreeParent(parent)) return null;
  return nodes.every((n) => parentOf(root, n) === parent) ? parent : null;
}

export const ALIGNMENTS = Object.freeze({
  left: 'Align left edges', center: 'Align centres across', right: 'Align right edges',
  top: 'Align top edges', middle: 'Align centres down', bottom: 'Align bottom edges',
  across: 'Space evenly across', down: 'Space evenly down',
});

/**
 * Lines up freely placed nodes (how: a key of ALIGNMENTS). The edges and
 * centres are those of the first node; spacing evenly keeps the outermost
 * two where they are and puts equal gaps between the rest. Returns a
 * message saying why not, or null.
 */
export function alignNodes(nodes, how) {
  if (!(how in ALIGNMENTS)) return `there is no alignment '${how}'`;
  const spacing = how === 'across' || how === 'down';
  if (nodes.length < (spacing ? 3 : 2)) return spacing ? 'select three or more widgets to space them evenly' : 'select two or more widgets to align them';
  const first = rectOf(nodes[0]);
  if (!spacing) {
    for (const node of nodes.slice(1)) {
      const r = rectOf(node);
      switch (how) {
        case 'left': moveTo(node, first.x, r.y); break;
        case 'center': moveTo(node, first.x + (first.width - r.width) / 2, r.y); break;
        case 'right': moveTo(node, first.x + first.width - r.width, r.y); break;
        case 'top': moveTo(node, r.x, first.y); break;
        case 'middle': moveTo(node, r.x, first.y + (first.height - r.height) / 2); break;
        default: moveTo(node, r.x, first.y + first.height - r.height); break;
      }
    }
    return null;
  }
  const [at, size] = how === 'across' ? ['x', 'width'] : ['y', 'height'];
  const sorted = [...nodes].sort((a, b) => rectOf(a)[at] - rectOf(b)[at]);
  const rects = sorted.map(rectOf);
  const last = rects[rects.length - 1];
  const span = last[at] + last[size] - rects[0][at];
  const gap = (span - rects.reduce((sum, r) => sum + r[size], 0)) / (rects.length - 1);
  let next = rects[0][at];
  sorted.forEach((node, i) => {
    const r = rects[i];
    if (how === 'across') moveTo(node, next, r.y); else moveTo(node, r.x, next);
    next += r[size] + gap;
  });
  return null;
}

/**
 * Where a box being dragged should sit so that its edges or its centre line
 * up with those of the boxes near it: { x, y, guides } where guides are the
 * lines it now lies on ([{ axis: 'x' | 'y', at }]). An edge closer than
 * tolerance to a line snaps to it; with none that close, x and y are as given.
 */
export function snapBox(box, others, tolerance = 5) {
  const lines = (r, at, size) => [r[at], r[at] + r[size] / 2, r[at] + r[size]];
  const result = { x: box.x, y: box.y, guides: [] };
  for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
    let best = null;
    for (const mine of lines(box, axis, size)) {
      for (const other of others) {
        for (const line of lines(other, axis, size)) {
          const d = line - mine;
          if (Math.abs(d) <= tolerance && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
        }
      }
    }
    if (best) {
      result[axis] = Math.round(box[axis] + best.d);
      result.guides.push({ axis, at: best.line });
    }
  }
  return result;
}

/**
 * Puts node inside a new container of class cls (an HPanel, a VPanel...),
 * which takes node's place in the design: its position, its place in its
 * parent's layout and its flex. Returns { node } (the new container), or
 * { problem } saying why not; nothing changes with a problem.
 */
export function wrapNode(root, node, cls) {
  const parent = parentOf(root, node);
  if (!parent) return { problem: 'the root cannot be wrapped: add it to a New composite instead' };
  if (!LIST_CONTAINERS.has(cls)) return { problem: `a ${cls} cannot wrap a widget` };
  const wrapper = newNode(cls);
  const place = placeOf(parent, node);
  if (isFreeParent(parent)) {
    const r = rectOf(node);
    wrapper.box = [r.x, r.y, Math.max(r.width, 8), Math.max(r.height, 8)];
  }
  for (const key of ['layoutProps', 'flex']) {
    if (node[key] !== undefined) { wrapper[key] = node[key]; delete node[key]; }
  }
  if (place.tabs) place.list[place.index].widget = wrapper;
  else if (place.list) place.list[place.index] = wrapper;
  else parent[place.slot] = wrapper;
  wrapper.children = [node];
  return { node: wrapper };
}

/** The node's field that holds the text shown on it (its text, or a Window's or a bar's title), or null. */
export function textFieldOf(node, options) {
  const fields = fieldsFor(node, options).flatMap(([, fs]) => fs);
  return fields.find((f) => f.type === 'text' && (f.key === 'text' || f.key === 'title')) ?? null;
}

/**
 * What an empty list shows in the Preview while it is designed, so that its
 * size and look can be judged: sample rows for a ListPanel or a SelectBox
 * with no items of its own, else null. They are never saved or generated.
 */
export function sampleItems(node) {
  if ((node.items ?? []).length) return null;
  if (node.class === 'ListPanel' && node.emptyText) return null;   // what it says when empty is part of the design
  if (node.class === 'ListPanel') return ['Sample item 1', 'Sample item 2', 'Sample item 3'];
  if (node.class === 'SelectBox') return ['Sample choice 1', 'Sample choice 2'];
  return null;
}

// ---- starter designs --------------------------------------------------------

const withProps = (cls, props = {}, children = []) => {
  const node = Object.assign(newNode(cls), props);
  for (const child of children) addChild(node, child);
  return node;
};
const on = (method, handler) => ({ events: [{ method, handler }] });

/**
 * Designs to start from: [{ name, description, build() }] where build()
 * returns a new root. Each names its handlers, so its program has a function
 * to fill in for every button.
 */
export const TEMPLATES = Object.freeze([
  {
    name: 'Form',
    description: 'Labels and fields in a column, with OK and Cancel',
    build: () => withProps('VPanel', { spacing: 6, padding: 12 }, [
      withProps('Label', { text: 'Sign up' }),
      withProps('Label', { text: 'Name' }),
      withProps('TextField', { id: 'name', placeholder: 'Your name' }),
      withProps('Label', { text: 'Email' }),
      withProps('TextField', { id: 'email', placeholder: 'you@example.com' }),
      withProps('Spacer', { flex: 1 }),
      withProps('HPanel', { spacing: 6 }, [
        withProps('Spacer', { flex: 1 }),
        withProps('Button', { id: 'cancel', text: 'Cancel', ...on('onClick', 'cancel_clicked') }),
        withProps('Button', { id: 'ok', text: 'OK', ...on('onClick', 'ok_clicked') }),
      ]),
    ]),
  },
  {
    name: 'List and detail',
    description: 'A list on the left; what is picked shows on the right',
    build: () => {
      const split = withProps('HSplitPanel', { position: 0.35 });
      addChild(split, withProps('ListPanel', { id: 'items', items: ['First', 'Second', 'Third'], ...on('onSelect', 'item_selected') }));
      addChild(split, withProps('VPanel', { spacing: 6, padding: 8 }, [
        withProps('Label', { id: 'title', text: 'Pick an item' }),
        withProps('TextPanel', { id: 'detail', text: '', readOnly: true, flex: 1 }),
      ]));
      return split;
    },
  },
  {
    name: 'Tabs',
    description: 'Two pages, one behind each tab',
    build: () => {
      const tabs = withProps('TabPanel', { id: 'tabs', ...on('onSelect', 'tab_selected') });
      addChild(tabs, withProps('VPanel', { padding: 8 }, [withProps('Label', { text: 'The home page' })]));
      addChild(tabs, withProps('VPanel', { padding: 8 }, [withProps('Label', { text: 'The settings page' })]));
      tabs.tabs[0].label = 'Home';
      tabs.tabs[1].label = 'Settings';
      return tabs;
    },
  },
  {
    name: 'Phone app',
    description: 'A title bar, a list that fills the screen and a row of buttons',
    build: () => withProps('VPanel', {}, [
      withProps('NavigationBar', { id: 'bar', title: 'My app', actionText: 'Add', ...on('onAction', 'add_tapped') }),
      withProps('ListPanel', { id: 'list', flex: 1, emptyText: 'Nothing here yet', ...on('onSelect', 'row_selected') }),
      withProps('HPanel', { spacing: 6, padding: 6 }, [
        withProps('Button', { id: 'home', text: 'Home', flex: 1, ...on('onClick', 'home_tapped') }),
        withProps('Button', { id: 'more', text: 'More', flex: 1, ...on('onClick', 'more_tapped') }),
      ]),
    ]),
  },
  {
    name: 'Slides',
    description: 'A Carousel of three pages with Back and Next: its pages slide when it runs',
    build: () => withProps('VPanel', { spacing: 6 }, [
      withProps('Carousel', { id: 'slides', flex: 1, ...on('onSelect', 'slide_changed') }, [
        withProps('Panel', { background: '#2d6cdf' }, [withProps('Label', { text: 'One', box: [20, 20, 100, 24], color: '#ffffff', background: '#2d6cdf' })]),
        withProps('Panel', { background: '#1f9d55' }, [withProps('Label', { text: 'Two', box: [20, 20, 100, 24], color: '#ffffff', background: '#1f9d55' })]),
        withProps('Panel', { background: '#c2410c' }, [withProps('Label', { text: 'Three', box: [20, 20, 100, 24], color: '#ffffff', background: '#c2410c' })]),
      ]),
      withProps('HPanel', { spacing: 6, padding: 6 }, [
        withProps('Button', { id: 'back', text: 'Back', ...on('onClick', 'back_clicked') }),
        withProps('Spacer', { flex: 1 }),
        withProps('Button', { id: 'next', text: 'Next', ...on('onClick', 'next_clicked') }),
      ]),
    ]),
  },
  {
    name: 'Game menu',
    description: 'A title and the buttons of a start screen',
    build: () => withProps('Panel', { background: '#1b1f2a' }, [
      withProps('Label', { id: 'title', text: 'My game', box: [110, 40, 100, 24], color: '#ffffff', background: '#1b1f2a' }),
      withProps('Button', { id: 'play', text: 'Play', box: [110, 90, 100, 32], ...on('onClick', 'play_clicked') }),
      withProps('Button', { id: 'options', text: 'Options', box: [110, 130, 100, 32], ...on('onClick', 'options_clicked') }),
      withProps('Button', { id: 'quit', text: 'Quit', box: [110, 170, 100, 32], ...on('onClick', 'quit_clicked') }),
    ]),
  },
]);
