// The widgets programs make, in the browser: the VM's widget host (its `gui`
// option) for an AppScreen. It implements the host interface described in
// src/vm/runtime/widgets.js - create / has / classOf / call - with the UI
// toolkit's own classes (docs/widgets.txt), so a BLIP builds its screen from
// the same Buttons, HPanels, ListPanels and Windows the IDE is made of.
//
// Layout. A new widget goes on the screen (the AppScreen's widget layer) at
// its class's default box. On the screen, and in a Panel, a widget sits
// where the program puts it (setLeft, setBounds, ...), or fills the whole
// area after fill(). In an HPanel, VPanel or ButtonBar the panel places it:
// setWidth (in a row) or setHeight (in a column) fixes its size there, and
// setFlex shares out the space left over. Windows float above the rest.
//
// The Viewport. The layer itself is the program's Viewport, the root of its
// widgets: New Viewport() / Viewport() gives it (always the same one). It
// can be written out as JSON (toJson) and rebuilt from it (fromJson), and
// saved to and loaded from the database by name (the viewports table): the
// classes, ids, text, sizes, layout settings, list items, menu items and
// the names of the event handlers, but not the program's code.

import { Panel } from './widgets/panel.js';
import { HPanel } from './widgets/hpanel.js';
import { VPanel } from './widgets/vpanel.js';
import { ButtonBar } from './widgets/button-bar.js';
import { HSplitPanel } from './widgets/hsplit-panel.js';
import { VSplitPanel } from './widgets/vsplit-panel.js';
import { TabPanel } from './widgets/tab-panel.js';
import { TextPanel } from './widgets/text-panel.js';
import { MonacoPanel } from './widgets/monaco-panel.js';
import { ListPanel } from './widgets/list-panel.js';
import { Button } from './widgets/button.js';
import { Label } from './widgets/label.js';
import { Menu } from './widgets/menu.js';
import { Spacer } from './widgets/spacer.js';
import { Window } from './windows/window.js';
import { WidgetError, CLASS_BY_NAME } from '../vm/runtime/widgets.js';
import { SourceStore } from './db-client.js';

/** The format tag of a saved viewport. */
export const VIEWPORT_FORMAT = 'fastblip-viewport';
export const VIEWPORT_VERSION = 1;

/** The database table of saved viewports: records { name, content }. */
export const viewportStore = new SourceStore({ resource: 'viewports', key: 'viewport' });

const STYLE = `
.cr-app-widgets .cr-window-minimize{display:none}
.cr-app-menu .cr-menu-button{box-sizing:border-box;width:100%;border:1px solid transparent;
  border-radius:var(--cr-radius-button);background:var(--cr-button-bg);color:var(--cr-button-text);
  box-shadow:var(--cr-button-shadow)}
.cr-app-menu .cr-menu-button::after{content:' \\25BE'}
.cr-app-menu .cr-menu-button:hover,.cr-app-menu.open .cr-menu-button{background:var(--cr-button-hover);
  color:var(--cr-button-text)}
`;

function installStyle() {
  if (document.getElementById('cr-app-widgets-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-app-widgets-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** Places the children of the screen or of a Panel: where the program put
 *  them, or filling the area. Windows place themselves. */
function layoutFree(panel) {
  const { width, height } = panel.bounds;
  for (const child of panel.children) {
    if (child instanceof Window) continue;
    if (child.fillParent) child.setBounds(0, 0, width, height);
    else if (child.box) child.setBounds(...child.box);
  }
}

/** The layer holding the program's top-level widgets, laid over the
 *  AppScreen's text; clicks elsewhere go through to the text. */
export class FreeLayer extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-app-widgets');
    this.element.style.pointerEvents = 'none';
  }

  /** The program's Windows, back to front (Window.refreshActive uses it). */
  get windows() {
    return this._children.filter((c) => c instanceof Window)
      .sort((a, b) => (Number(a.element.style.zIndex) || 0) - (Number(b.element.style.zIndex) || 0));
  }

  layout() {
    layoutFree(this);
    super.layout();
  }
}

/** A program's Panel: children placed where the program puts them. */
class FreePanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-app-panel');
  }

  layout() {
    layoutFree(this);
    super.layout();
  }
}

/** A program's Label: normal text colour, opaque, left-aligned. */
export class AppLabel extends Label {
  constructor(text) {
    super(text);
    this.element.classList.add('cr-app-label');
    this.element.style.color = 'var(--cr-text)';
    // Opaque, so text the program printed underneath does not show through.
    this.element.style.background = 'var(--cr-output-bg)';
    this.element.style.font = 'var(--cr-font-size) var(--cr-font-ui)';
  }
}

/** className -> (constructor args) -> widget, and its default box. */
const CLASSES = {
  Label: { make: (text) => new AppLabel(text), box: [0, 0, 100, 24] },
  Button: { make: (text) => new Button(text), box: [0, 0, 100, 32] },
  Menu: {
    make: (text) => {
      const menu = new Menu(text);
      menu.element.classList.add('cr-app-menu');
      return menu;
    },
    box: [0, 0, 90, 28],
  },
  Spacer: { make: () => new Spacer(), box: [0, 0, 0, 0] },
  Panel: { make: () => new FreePanel(), box: [0, 0, 320, 200] },
  HPanel: { make: () => new HPanel(), box: [0, 0, 320, 32] },
  VPanel: { make: () => new VPanel(), box: [0, 0, 320, 200] },
  ButtonBar: { make: () => new ButtonBar(), box: [0, 0, 320, 30] },
  HSplitPanel: { make: () => new HSplitPanel(), box: [0, 0, 320, 200] },
  VSplitPanel: { make: () => new VSplitPanel(), box: [0, 0, 320, 200] },
  TabPanel: { make: () => new TabPanel(), box: [0, 0, 320, 200] },
  Window: { make: (title) => new Window({ title, x: 20, y: 20, width: 320, height: 240 }), box: null },
  TextPanel: { make: (text) => new TextPanel({ text }), box: [0, 0, 240, 120] },
  MonacoPanel: { make: (text, language) => new MonacoPanel({ text, language }), box: [0, 0, 320, 200] },
  ListPanel: { make: () => new ListPanel(), box: [0, 0, 160, 160] },
};

/** Classes whose natural width is their text's. */
const TEXT_SIZED = new Set(['Label', 'Button', 'Menu']);

/**
 * The VM's widget host for an AppScreen. Widgets get ids from 1; every
 * widget the program can reach (including a Window's ButtonBar, and Buttons
 * made by addButton) is registered with one.
 */
export class ProgramWidgetHost {
  constructor(layer) {
    this.layer = layer;
    this._widgets = new Map();       // id -> widget
    this._ids = new Map();           // widget -> id
    this._nextId = 1;
    this._nextItem = 1;              // ListPanel item values
    this._windows = new Set();       // the program's Windows, open or closed
    this.layer.id = '';
  }

  /** The widget with this id, or undefined. */
  widget(id) { return this._widgets.get(id); }

  /** Every widget, oldest first. */
  get widgets() { return [...this._widgets.values()]; }

  /** Removes every widget; ids start from 1 again. */
  clear() {
    for (const child of this.layer.children) {
      if (child instanceof Menu) child.close();
      this.layer.remove(child);
    }
    for (const w of this._widgets.values()) if (w instanceof Menu) w.close();
    this._widgets.clear();
    this._ids.clear();
    this._windows.clear();
    this._nextId = 1;
    this.layer.id = '';
    this.layer.element.style.background = '';
    this.layer.element.style.color = '';
    this.layer._background = undefined;
    this.layer._color = undefined;
  }

  _register(widget, className) {
    widget.programClass = className;
    widget.element.style.pointerEvents = 'auto';
    const id = this._nextId++;
    widget.element.dataset.widgetId = String(id);
    this._widgets.set(id, widget);
    this._ids.set(widget, id);
    return id;
  }

  /** The id of a widget, registering it if the program has not reached it
   *  yet (the Viewport, a Window's ButtonBar); 0 for none. */
  _idOf(widget) {
    if (!widget) return 0;
    if (this._ids.has(widget)) return this._ids.get(widget);
    if (widget === this.layer) return this._register(this.layer, 'Viewport');
    if (widget.programClass) return this._register(widget, widget.programClass);
    return 0;
  }

  create(className, args) {
    if (className === 'Viewport') return this._idOf(this.layer);
    const spec = CLASSES[className];
    if (!spec) throw new WidgetError(`there is no widget class '${className}'`);
    const widget = spec.make(...args);
    if (spec.box) {
      widget.box = [...spec.box];
      // In a VPanel a widget with no height of its own gets its class's
      // default height; in an HPanel, a widget with no text to measure gets
      // its default width.
      const [, , width, height] = spec.box;
      widget.preferredHeight = () => height;
      if (!TEXT_SIZED.has(className)) widget.preferredWidth = () => width;
    }
    const id = this._register(widget, className);
    if (widget instanceof Window) {
      widget.buttonBar.programClass = 'ButtonBar';
      this._windows.add(widget);
    }
    this.layer.add(widget);
    if (widget instanceof Window) widget.bringToFront();
    this.layer.layout();
    return id;
  }

  has(id) { return this._widgets.has(id); }

  classOf(id) { return this._widgets.get(id)?.programClass; }

  /** Lays out what changed: the widget's parent (or the widget itself). */
  _relayout(widget) {
    const parent = widget.parent;
    if (parent && parent !== this.layer) parent.layout();
    else if (parent === this.layer) this.layer.layout();
    else widget.layout();
  }

  _child(id) {
    const child = this._widgets.get(id);
    if (!child) throw new WidgetError('that widget no longer exists');
    return child;
  }

  /** A child for a container: not a Window, and not the container or one of its ancestors. */
  _placeable(container, id) {
    const child = this._child(id);
    if (child instanceof Window) throw new WidgetError('a Window floats on the screen: it cannot go inside another widget');
    if (child === container || child.element.contains(container.element)) {
      throw new WidgetError('a widget cannot go inside itself');
    }
    return child;
  }

  _index(i, n, what = 'index') {
    if (i < 0 || i >= n) {
      throw new WidgetError(n === 0 ? `${what} ${i}: there are none` : `${what} ${i} is out of range 0..${n - 1}`);
    }
    return i;
  }

  /** The element whose colours the program sets: a list's or text box's own, else the widget's. */
  _surface(w) {
    if (w instanceof ListPanel) return w.list;
    if (w instanceof TextPanel) return w.textArea;
    return w.element;
  }

  /** Sets part of the program's box, and the fixed size a row or column uses. */
  _setBox(w, left, top, width, height) {
    if (w instanceof Window) {
      const b = w.bounds;
      w.setBounds(left ?? b.x, top ?? b.y, width ?? b.width, height ?? b.height);
      return;
    }
    const box = w.box ?? [0, 0, 0, 0];
    w.box = [left ?? box[0], top ?? box[1], width ?? box[2], height ?? box[3]];
    if (width !== undefined) w.fixedWidth = width;
    if (height !== undefined) w.fixedHeight = height;
    this._relayout(w);
  }

  // ------------------------------------------------------------- events

  /** Registers an event handler (onClick, onSelect, ...) and records its
   *  name for toJson. */
  _listen(w, method, callback) {
    (w._events ??= []).push({ method, handler: callback.handlerName ?? null });
    const own = (type, f) => w.element.addEventListener(type, (e) => { if (e.target === w.element) f(e); });
    switch (method) {
      case 'onClick': w.element.addEventListener('click', () => callback()); break;
      case 'onSelect': own('select', (e) => callback(e.detail.index)); break;
      case 'onChange':
        if (w instanceof HSplitPanel || w instanceof VSplitPanel) own('change', (e) => callback(e.detail.position));
        else own('change', () => callback(w.text));
        break;
      case 'onSubmit': own('submit', () => callback()); break;
      case 'onClose': own('close', () => callback()); break;
      default: throw new WidgetError(`a ${w.programClass} has no event '${method}'`);
    }
  }

  /** Adds a Menu item (a separator when label is null), recording it for toJson. */
  _addMenuItem(menu, label, callback) {
    menu._items ??= [];
    if (label === null) {
      menu._items.push({ separator: true });
      menu.addSeparator();
      return;
    }
    menu._items.push({ label, handler: callback?.handlerName ?? null });
    menu.addItem(label, () => callback?.(label));
  }

  // ----------------------------------------------------------- viewport

  /** Removes every widget from the Viewport, Windows included. */
  _clearViewport() {
    for (const child of this.layer.children) {
      if (child instanceof Menu) child.close();
      this.layer.remove(child);
    }
    for (const win of this._windows) if (win.parent) win.parent.remove(win);
    this._windows.clear();
  }

  /** The Viewport as a JSON-ready object. */
  _saveViewport() {
    const doc = { format: VIEWPORT_FORMAT, version: VIEWPORT_VERSION };
    if (this.layer.id) doc.id = this.layer.id;
    if (this.layer._background) doc.background = this.layer._background;
    if (this.layer._color) doc.color = this.layer._color;
    doc.widgets = this.layer.children.filter((c) => !(c instanceof Window)).map((c) => this._save(c));
    // Every Window the program has, open or closed, back to front.
    doc.windows = [...this._windows].map((win) => ({ ...this._save(win), open: win.parent === this.layer }));
    return doc;
  }

  /** One widget, and everything in it, as a JSON-ready object. */
  _save(w) {
    const cls = w.programClass;
    const node = { class: cls };
    if (w.id) node.id = w.id;
    const put = (key, value, skip) => { if (value !== undefined && value !== skip) node[key] = value; };

    switch (cls) {
      case 'Label': node.text = w.text; break;
      case 'Button': node.text = w.label; put('enabled', w.enabled, true); break;
      case 'Menu':
        node.text = w.label;
        node.items = (w._items ?? []).map((item) => ({ ...item }));
        break;
      case 'Window': {
        const b = w.bounds;
        node.title = w.title;
        node.bounds = [b.x, b.y, b.width, b.height];
        put('maximized', w.maximized, false);
        if (w.content) node.content = this._save(w.content);
        if (w.buttonBar.children.length) node.buttonBar = this._save(w.buttonBar);
        break;
      }
      case 'TextPanel': case 'MonacoPanel':
        node.text = w.text;
        if (cls === 'MonacoPanel') node.language = w.language;
        put('readOnly', w.readOnly, false);
        break;
      case 'ListPanel':
        node.items = w.items.map((item) => item.label);
        put('selected', w.selectedIndex, -1);
        put('emptyText', w.emptyText, '');
        break;
      case 'HPanel': case 'VPanel':
        put('padding', w.padding, 0);
        put('spacing', w.spacing, 0);
        break;
      case 'HSplitPanel': case 'VSplitPanel':
        node.position = w.position;
        node.first = w.first ? this._save(w.first) : null;
        node.second = w.second ? this._save(w.second) : null;
        break;
      case 'TabPanel':
        node.tabs = w.labels.map((label, i) => ({ label, widget: this._save(w.children[i]) }));
        put('selected', w.selectedIndex, 0);
        break;
      default: break;
    }
    if (['Panel', 'HPanel', 'VPanel', 'ButtonBar'].includes(cls)) {
      node.children = w.children.map((c) => this._save(c));
    }

    if (cls !== 'Window') {
      if (w.box) node.box = [...w.box];
      put('width', w.fixedWidth ?? undefined);
      put('height', w.fixedHeight ?? undefined);
    }
    put('flex', w.flex ?? undefined, cls === 'Spacer' ? 1 : undefined);
    put('fill', w.fillParent ? true : undefined);
    if (!(w.parent instanceof TabPanel)) put('visible', w.visible, true);   // tabs show their own page
    put('background', w._background || undefined);
    put('color', w._color || undefined);
    const events = (w._events ?? []).filter((e) => e.handler);
    if (events.length) node.events = events.map((e) => ({ ...e }));
    return node;
  }

  /** JSON text -> a saved viewport, checked. */
  _parse(text) {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      throw new WidgetError(`not JSON: ${err.message}`);
    }
    return doc;
  }

  /**
   * Replaces the Viewport's widgets with the ones in doc. resolve(widgetId,
   * handlerName, detailKind) turns each saved handler name into a callback.
   */
  _loadViewport(doc, resolve) {
    if (!doc || typeof doc !== 'object' || doc.format !== VIEWPORT_FORMAT) {
      throw new WidgetError(`not a saved viewport (its "format" must be "${VIEWPORT_FORMAT}")`);
    }
    if (doc.version > VIEWPORT_VERSION) {
      throw new WidgetError(`this viewport was saved by a newer FastBlip (version ${doc.version})`);
    }
    // Build everything first, so a bad node leaves the screen as it was.
    const pending = [];
    const widgets = (doc.widgets ?? []).map((node) => this._build(node, pending));
    const windows = (doc.windows ?? []).map((node) => [this._build(node, pending), node.open !== false]);
    this._clearViewport();
    this.layer.id = typeof doc.id === 'string' ? doc.id : '';
    this.layer._background = doc.background;
    this.layer._color = doc.color;
    this.layer.element.style.background = doc.background ?? '';
    this.layer.element.style.color = doc.color ?? '';
    for (const w of widgets) this.layer.add(w);
    for (const [win, open] of windows) {
      this._windows.add(win);
      if (open) { this.layer.add(win); win.bringToFront(); }
    }
    this.layer.layout();
    for (const win of this._windows) {
      win.layout();
      if (win._pendingMaximize) {
        delete win._pendingMaximize;
        win.maximize();
      }
    }
    // Then wire up the handlers.
    for (const { w, event, item } of pending) {
      const detail = this._detailKind(w.programClass, event.method, item);
      const callback = resolve(this._idOf(w), event.handler, detail);
      if (item) item.callback = callback;
      else this._listen(w, event.method, callback);
    }
  }

  /** The kind of value an event passes (handler:<kind> in the class table), or null. */
  _detailKind(className, methodName, item) {
    const cls = CLASS_BY_NAME.get(className);
    const m = cls?.methods.find((x) => x.name === (item ? 'addItem' : methodName));
    const handler = m?.params.find((k) => k.startsWith('handler'));
    if (!handler) throw new WidgetError(`a ${className} has no event '${methodName}'`);
    return handler.split(':')[1] ?? null;
  }

  /** Makes one saved widget and everything in it; handlers go into pending. */
  _build(node, pending) {
    if (!node || typeof node !== 'object') throw new WidgetError('not a saved widget');
    const cls = node.class;
    const spec = CLASSES[cls];
    if (!spec) throw new WidgetError(`there is no widget class '${cls}'`);
    const str = (v, dflt = '') => (v === undefined || v === null ? dflt : String(v));
    const num = (v) => (Number.isFinite(v) ? v : undefined);
    const args = {
      Label: [str(node.text)], Button: [str(node.text)], Menu: [str(node.text)],
      Window: [str(node.title)], TextPanel: [str(node.text)],
      MonacoPanel: [str(node.text), str(node.language, 'plaintext')],
    }[cls] ?? [];
    const w = spec.make(...args);
    if (spec.box) {
      w.box = Array.isArray(node.box) && node.box.length === 4 && node.box.every(Number.isFinite)
        ? [...node.box] : [...spec.box];
      const [, , width, height] = spec.box;
      w.preferredHeight = () => height;
      if (!TEXT_SIZED.has(cls)) w.preferredWidth = () => width;
    }
    this._register(w, cls);
    if (w instanceof Window) w.buttonBar.programClass = 'ButtonBar';
    if (typeof node.id === 'string') w.id = node.id;
    if (num(node.width) !== undefined) w.fixedWidth = node.width;
    if (num(node.height) !== undefined) w.fixedHeight = node.height;
    if (num(node.flex) !== undefined) w.flex = node.flex;
    if (node.fill === true) w.fillParent = true;
    if (node.visible === false) w.visible = false;
    if (node.background) { w._background = String(node.background); this._surface(w).style.background = w._background; }
    if (node.color) { w._color = String(node.color); this._surface(w).style.color = w._color; }
    const child = (n) => this._build(n, pending);

    switch (cls) {
      case 'Button': if (node.enabled === false) w.enabled = false; break;
      case 'Menu':
        w._items = [];
        for (const item of node.items ?? []) {
          if (item?.separator) { this._addMenuItem(w, null); continue; }
          const label = str(item?.label);
          const entry = { label, handler: item?.handler ?? null };
          w._items.push(entry);
          w.addItem(label, () => entry.callback?.(label));
          if (entry.handler) pending.push({ w, event: { method: 'addItem', handler: entry.handler }, item: entry });
        }
        break;
      case 'Window':
        if (Array.isArray(node.bounds) && node.bounds.every(Number.isFinite)) w.setBounds(...node.bounds);
        if (node.content) w.content = child(node.content);
        if (node.buttonBar) {
          if (node.buttonBar.id) w.buttonBar.id = String(node.buttonBar.id);
          for (const n of node.buttonBar.children ?? []) w.buttonBar.add(child(n));
        }
        if (node.maximized) w._pendingMaximize = true;
        break;
      case 'TextPanel': case 'MonacoPanel': if (node.readOnly) w.readOnly = true; break;
      case 'ListPanel':
        w.items = (node.items ?? []).map((label) => ({ label: str(label), value: this._nextItem++ }));
        if (typeof node.emptyText === 'string') { w.emptyText = node.emptyText; w.items = w.items; }
        if (Number.isInteger(node.selected) && node.selected >= 0 && node.selected < w.items.length) w.select(node.selected);
        break;
      case 'HPanel': case 'VPanel':
        if (num(node.padding) !== undefined) w.padding = node.padding;
        if (num(node.spacing) !== undefined) w.spacing = node.spacing;
        break;
      case 'HSplitPanel': case 'VSplitPanel':
        if (node.first) w.first = child(node.first);
        if (node.second) w.second = child(node.second);
        if (num(node.position) !== undefined) w._position = Math.min(1, Math.max(0, node.position));
        break;
      case 'TabPanel':
        for (const tab of node.tabs ?? []) w.addTab(str(tab?.label), child(tab?.widget));
        if (Number.isInteger(node.selected) && node.selected > 0 && node.selected < w.labels.length) w.select(node.selected);
        break;
      default: break;
    }
    if (['Panel', 'HPanel', 'VPanel', 'ButtonBar'].includes(cls)) {
      for (const n of node.children ?? []) w.add(child(n));
    }
    for (const event of node.events ?? []) {
      if (event?.handler) pending.push({ w, event: { method: String(event.method), handler: String(event.handler) } });
    }
    return w;
  }

  // ------------------------------------------------------------ database

  /** Saves the Viewport under name: a new record, or the one already called that. */
  async _store(name) {
    if (!name) throw new WidgetError('a saved viewport needs a name');
    const content = this._saveViewport();
    const [existing] = await viewportStore.findByName(name);
    if (existing) await viewportStore.update(existing.id, { content });
    else await viewportStore.create({ name, content });
  }

  /** The saved viewport called name. */
  async _fetch(name) {
    const [record] = await viewportStore.findByName(name);
    if (!record) throw new WidgetError(`there is no saved viewport named '${name}'`);
    return typeof record.content === 'string' ? this._parse(record.content) : record.content;
  }

  call(id, method, args) {
    const w = this._widgets.get(id);
    const cls = w.programClass;
    const [a, b] = args;
    if (/^on[A-Z]/.test(method)) { this._listen(w, method, a); return undefined; }
    switch (method) {
      // ---- every widget, and the Viewport
      case 'setId': w.id = a; return undefined;
      case 'getId': return w.id;
      case 'findById': return this._idOf(w.findById(a));
      case 'findByClass': return w.findByClass(a).map((x) => this._idOf(x));
      case 'toJson': return JSON.stringify(w === this.layer ? this._saveViewport() : this._save(w));
      // ---- every widget
      case 'setLeft': return this._setBox(w, a);
      case 'setTop': return this._setBox(w, undefined, a);
      case 'setWidth': return this._setBox(w, undefined, undefined, a);
      case 'setHeight': return this._setBox(w, undefined, undefined, undefined, a);
      case 'setBounds': return this._setBox(w, ...args);
      case 'getLeft': return w.bounds.x;
      case 'getTop': return w.bounds.y;
      case 'getWidth': return w.bounds.width;
      case 'getHeight': return w.bounds.height;
      case 'setFlex': w.flex = a; return this._relayout(w);
      case 'fill':
        if (w instanceof Window) { w.maximize(); return undefined; }
        w.fillParent = true;
        return this._relayout(w);
      case 'setVisible':
        w.visible = a;
        if (w instanceof Window) Window.refreshActive(w.parent);
        return this._relayout(w);
      case 'isVisible': return w.visible;
      case 'setBackground': w._background = a; this._surface(w).style.background = a; return undefined;
      case 'setColor': w._color = a; this._surface(w).style.color = a; return undefined;
      case 'getParent': return this._idOf(w.parent);
      case 'remove': {
        const parent = w.parent;
        if (!parent) return undefined;
        parent.remove(w);
        if (w instanceof Window) Window.refreshActive(parent);
        if (parent !== this.layer) parent.layout();
        return undefined;
      }
      default: break;
    }

    switch (`${cls}.${method}`) {
      // ---- text
      case 'Label.setText': w.text = a; return undefined;
      case 'Label.getText': return w.text;
      case 'Button.setText': case 'Menu.setText':
        w.label = a;
        return this._relayout(w);
      case 'Button.getText': case 'Menu.getText': return w.label;
      case 'TextPanel.setText': case 'MonacoPanel.setText': w.text = a; return undefined;
      case 'TextPanel.getText': case 'MonacoPanel.getText': return w.text;

      case 'Button.setEnabled': w.enabled = a; return undefined;
      case 'Button.isEnabled': return w.enabled;

      // ---- Menu
      case 'Menu.addItem': this._addMenuItem(w, a, b); return undefined;
      case 'Menu.addSeparator': this._addMenuItem(w, null); return undefined;
      case 'Menu.clear': w.close(); w.items = []; w._items = []; return undefined;

      // ---- containers
      // ---- the Viewport
      case 'Viewport.add': {
        const child = this._child(a);
        if (!(child instanceof Window)) this._placeable(w, a);
        w.add(child);
        if (child instanceof Window) { this._windows.add(child); child.bringToFront(); }
        w.layout();
        return undefined;
      }
      case 'Viewport.getCount': return w.children.length;
      case 'Viewport.getChild': return this._idOf(w.children[this._index(a, w.children.length)]);
      case 'Viewport.clear': this._clearViewport(); return undefined;
      case 'Viewport.fromJson': this._loadViewport(this._parse(a), b); return undefined;
      case 'Viewport.save': return this._store(a);
      case 'Viewport.load': return this._fetch(a).then((doc) => { this._loadViewport(doc, b); });

      case 'Panel.add': case 'HPanel.add': case 'VPanel.add': case 'ButtonBar.add': {
        const child = this._placeable(w, a);
        w.add(child);
        w.layout();
        return undefined;
      }
      case 'Panel.getCount': case 'HPanel.getCount': case 'VPanel.getCount': case 'ButtonBar.getCount':
        return w.children.length;
      case 'Panel.getChild': case 'HPanel.getChild': case 'VPanel.getChild': case 'ButtonBar.getChild':
        return this._idOf(w.children[this._index(a, w.children.length)]);
      case 'Panel.clear': case 'HPanel.clear': case 'VPanel.clear': case 'ButtonBar.clear':
        for (const child of w.children) w.remove(child);
        w.layout();
        return undefined;
      case 'HPanel.setPadding': case 'VPanel.setPadding': w.padding = a; w.layout(); return undefined;
      case 'HPanel.setSpacing': case 'VPanel.setSpacing': w.spacing = a; w.layout(); return undefined;
      case 'ButtonBar.addButton': {
        const button = new Button(a);
        button.box = [...CLASSES.Button.box];
        button.preferredHeight = () => CLASSES.Button.box[3];
        const buttonId = this._register(button, 'Button');
        w.add(button);
        return buttonId;
      }

      // ---- split panels
      case 'HSplitPanel.setFirst': case 'VSplitPanel.setFirst': w.first = this._placeable(w, a); return undefined;
      case 'HSplitPanel.setSecond': case 'VSplitPanel.setSecond': w.second = this._placeable(w, a); return undefined;
      case 'HSplitPanel.getFirst': case 'VSplitPanel.getFirst': return this._idOf(w.first);
      case 'HSplitPanel.getSecond': case 'VSplitPanel.getSecond': return this._idOf(w.second);
      case 'HSplitPanel.setPosition': case 'VSplitPanel.setPosition': w.position = a; return undefined;
      case 'HSplitPanel.getPosition': case 'VSplitPanel.getPosition': return w.position;

      // ---- TabPanel
      case 'TabPanel.addTab': w.addTab(a, this._placeable(w, b)); w.layout(); return undefined;
      case 'TabPanel.select': w.select(this._index(a, w.labels.length, 'tab')); return undefined;
      case 'TabPanel.getSelectedIndex': return w.selectedIndex;
      case 'TabPanel.getSelectedText': return w.selectedLabel ?? '';
      case 'TabPanel.getCount': return w.labels.length;

      // ---- Window
      case 'Window.setTitle': w.title = a; return undefined;
      case 'Window.getTitle': return w.title;
      case 'Window.setContent': w.content = this._placeable(w, a); return undefined;
      case 'Window.getContent': return this._idOf(w.content);
      case 'Window.getButtonBar':
        return this._idOf(w.buttonBar) || this._register(w.buttonBar, 'ButtonBar');
      case 'Window.open': w.open(this.layer); this._windows.add(w); return undefined;
      case 'Window.close': w.close(); return undefined;
      case 'Window.maximize': w.maximize(); return undefined;
      case 'Window.restore': w.restore(); return undefined;
      case 'Window.isMaximized': return w.maximized;

      // ---- TextPanel and MonacoPanel
      case 'TextPanel.append': case 'MonacoPanel.append': w.append(a); return undefined;
      case 'TextPanel.setReadOnly': case 'MonacoPanel.setReadOnly': w.readOnly = a; return undefined;
      case 'TextPanel.isReadOnly': case 'MonacoPanel.isReadOnly': return w.readOnly;
      case 'TextPanel.focus': case 'MonacoPanel.focus': w.focus(); return undefined;

      // ---- ListPanel
      case 'ListPanel.addItem': w.addItem({ label: a, value: this._nextItem++ }); return undefined;
      case 'ListPanel.removeItem': w.removeItem(this._index(a, w.items.length)); return undefined;
      case 'ListPanel.setItem': {
        const old = w.items[this._index(a, w.items.length)];
        w.replaceItem(a, { label: b, value: old.value });
        return undefined;
      }
      case 'ListPanel.getItem': return w.items[this._index(a, w.items.length)].label;
      case 'ListPanel.getCount': return w.items.length;
      case 'ListPanel.clear': w.items = []; return undefined;
      case 'ListPanel.select':
        w.select(a === -1 ? -1 : this._index(a, w.items.length));
        return undefined;
      case 'ListPanel.getSelectedIndex': return w.selectedIndex;
      case 'ListPanel.getSelectedText': return w.selectedItem?.label ?? '';
      case 'ListPanel.setEmptyText': w.emptyText = a; w.items = w.items; return undefined;

      default:
        throw new WidgetError(`a ${cls} has no method '${method}'`);
    }
  }
}

