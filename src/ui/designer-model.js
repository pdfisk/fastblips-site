// The GUI designer's model: a composite widget as a tree of plain nodes,
// in the same form the widget host saves (toJson, saveComposite; see
// docs/viewports-server.md), and the edits the designer makes to it. No
// DOM here, so it is tested under Node; DesignerWindow
// (windows/designer-window.js) shows and edits it.
//
// A node is { class, id?, ...fields }. Its children live in different
// places by class: children (Panel, HPanel, VPanel, ButtonBar), first /
// second (the split panels), tabs[i].widget (TabPanel), content and
// buttonBar.children (Window). slots() gives them one shape.

import { WIDGET_CLASSES } from '../vm/runtime/widgets.js';
import { DEFAULT_BOXES, DEFAULT_WINDOW_BOUNDS } from './widget-defaults.js';

/** The classes the designer offers: every widget class but the singletons (the Viewport, the Board, the Canvas and the Physics). */
export const PALETTE = WIDGET_CLASSES.map((c) => c.name).filter((n) => !['Viewport', 'Board', 'Canvas', 'Physics'].includes(n)).sort((a, b) => a.localeCompare(b));

const LIST_CONTAINERS = new Set(['Panel', 'HPanel', 'VPanel', 'ButtonBar']);
const SPLITS = new Set(['HSplitPanel', 'VSplitPanel']);

/** A new node of a class, with the defaults a program's New would give it. */
export function newNode(cls) {
  if (!PALETTE.includes(cls)) throw new Error(`there is no widget class '${cls}'`);
  const node = { class: cls };
  switch (cls) {
    case 'Label': case 'Button': case 'Menu': node.text = cls; break;
    case 'TextPanel': node.text = ''; break;
    case 'MonacoPanel': node.text = ''; node.language = 'vb'; break;
    case 'Window': node.title = 'Window'; node.bounds = [...DEFAULT_WINDOW_BOUNDS]; break;
    case 'ListPanel': node.items = []; break;
    case 'TabPanel': node.tabs = []; break;
    default: break;
  }
  if (cls === 'Menu') node.items = [];
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
  if (caption !== undefined && caption !== '' && ['Label', 'Button', 'Menu', 'Window'].includes(node.class)) {
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
//   event   a handler's name (a Sub, or a MiniPy function)

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

const lines = (text) => String(text).split('\n').map((l) => l.replace(/\r$/, ''));

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
  padding: prop('padding', 'Padding', 'number'),
  borderWidth: prop('borderWidth', 'Outline width', 'number', 2),
  radius: prop('radius', 'Corner radius', 'number', 12),
  spacing: prop('spacing', 'Spacing', 'number'),
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

/** The fields the inspector shows for a node, in groups: [[title, fields]]. */
export function fieldsFor(node, { isRoot = false, parent = null } = {}) {
  const f = FIELDS;
  const cls = node.class;
  const own = {
    Label: [f.text], Button: [f.text, f.enabled], Menu: [f.text, f.menuItems],
    TextPanel: [f.textArea, f.readOnly], MonacoPanel: [f.textArea, f.language, f.readOnly],
    ListPanel: [f.listItems, f.selected, f.emptyText],
    HPanel: [f.padding, f.spacing], VPanel: [f.padding, f.spacing],
    Ellipse: [f.borderWidth], RoundedRect: [f.borderWidth, f.radius],
    HSplitPanel: [f.position], VSplitPanel: [f.position],
    TabPanel: [f.tabLabels, f.selected],
    Window: [f.title, f.maximized],
  }[cls] ?? [];
  const groups = [['Widget', [f.id, ...own]]];
  if (cls === 'Window') {
    groups.push(['Place', [f.winLeft, f.winTop, f.winWidth, f.winHeight]]);
  } else {
    const free = isRoot || !parent || parent.class === 'Panel';
    groups.push(['Place', free
      ? [f.left, f.top, f.width, f.height, f.fill]
      : [f.width, f.height, f.flex]]);
  }
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
  if (parent.class === 'Panel' && node.box) { node.box[0] += 12; node.box[1] += 12; }
  return { node };
}
