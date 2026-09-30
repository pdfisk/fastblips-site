// An in-memory widget host for the tests: the host interface of
// src/vm/runtime/widgets.js without a DOM. It models just enough of the
// browser host (src/ui/program-widgets.js) to check what the VM sends it:
// properties, parents and children, list items, tabs and event handlers,
// the Viewport (made on first use), ids, finding, and a simple JSON form
// saved to an in-memory database (this.saved, name -> JSON text).

import { WidgetError } from '../src/vm/runtime/widgets.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export class FakeHost {
  constructor() {
    this.widgets = new Map();
    this.next = 1;
    this.calls = [];
    this.saved = new Map();
    this.viewport = 0;
  }

  viewportId() {
    if (!this.viewport) this.viewport = this.create('Viewport', [], true);
    return this.viewport;
  }

  /** The widgets directly inside w: its children, or the top-level ones for the Viewport. */
  kids(w) {
    if (w.id === this.viewport) {
      return [...this.widgets.values()].filter((x) => x.parent === null && !x.detached && x.id !== this.viewport).map((x) => x.id);
    }
    return w.children;
  }

  *descendants(w) {
    for (const id of this.kids(w)) {
      yield this.widgets.get(id);
      yield* this.descendants(this.widgets.get(id));
    }
  }

  /** A widget and everything in it as a plain object. */
  save(w) {
    const node = { class: w.className, props: { ...w.props }, items: [...w.items], children: this.kids(w).map((id) => this.save(this.widgets.get(id))) };
    const events = Object.entries(w.handlers).flatMap(([event, cbs]) => cbs.map((cb) => ({ event, handler: cb.handlerName })));
    if (events.length) node.events = events;
    if (w.itemHandlers) node.itemHandlers = w.itemHandlers.map((cb) => cb.handlerName);
    return node;
  }

  load(node, parent, resolve) {
    const id = this.create(node.class, [node.props.text ?? '']);
    const w = this.widgets.get(id);
    Object.assign(w.props, node.props);
    w.items = [...node.items];
    if (parent) this.adopt(parent, id);
    for (const child of node.children) this.load(child, w, resolve);
    for (const { event, handler } of node.events ?? []) {
      (w.handlers[event] ??= []).push(resolve(id, handler, event === 'select' ? 'int' : null));
    }
    if (node.itemHandlers) w.itemHandlers = node.itemHandlers.map((h) => resolve(id, h, 'text'));
  }

  loadViewport(text, resolve) {
    const doc = JSON.parse(text);
    if (doc.class !== 'Viewport') throw new WidgetError('not a saved viewport');
    for (const w of [...this.widgets.values()]) if (w.id !== this.viewport) this.widgets.delete(w.id);
    for (const child of doc.children) this.load(child, null, resolve);
  }

  create(className, args, internal = false) {
    if (className === 'Viewport' && !internal) return this.viewportId();
    const id = this.next++;
    const w = {
      id, className, args, props: { visible: true, enabled: true }, children: [], parent: null,
      handlers: {}, items: [], selected: -1,
    };
    if (['Label', 'Button', 'Menu', 'TextPanel', 'MonacoPanel'].includes(className)) w.props.text = args[0];
    if (className === 'Window') w.props.title = args[0];
    this.widgets.set(id, w);
    return id;
  }

  has(id) { return this.widgets.has(id); }

  classOf(id) { return this.widgets.get(id).className; }

  /** The widget record for an id. */
  get(id) { return this.widgets.get(id); }

  /** Simulates an event: calls the handler registered with on<Event>. */
  fire(id, event, value) {
    for (const handler of this.widgets.get(id).handlers[event] ?? []) handler(value);
  }

  click(id) { this.fire(id, 'click'); }

  adopt(parent, childId) {
    const child = this.widgets.get(childId);
    if (child.parent) this.detach(child);
    child.detached = false;
    child.parent = parent.id;
    parent.children.push(childId);
  }

  detach(child) {
    const parent = this.widgets.get(child.parent);
    parent.children = parent.children.filter((c) => c !== child.id);
    child.parent = null;
    child.detached = true;
  }

  checkIndex(w, i, n) {
    if (i < 0 || i >= n) throw new WidgetError(`index ${i} is out of range 0..${n - 1}`);
  }

  call(id, method, args) {
    const w = this.widgets.get(id);
    this.calls.push([id, method, ...args]);
    const on = /^on([A-Z]\w*)$/.exec(method);
    if (on) { (w.handlers[on[1].toLowerCase()] ??= []).push(args[0]); return undefined; }
    switch (method) {
      case 'setBounds': [w.props.left, w.props.top, w.props.width, w.props.height] = args; return undefined;
      case 'add': this.adopt(w, args[0]); return undefined;
      case 'addTab': this.adopt(w, args[1]); w.items.push(args[0]); if (w.selected < 0) w.selected = 0; return undefined;
      case 'setContent': case 'setFirst': case 'setSecond':
        this.adopt(w, args[0]); w.props[method.slice(3).toLowerCase()] = args[0]; return undefined;
      case 'getContent': case 'getFirst': case 'getSecond': return w.props[method.slice(3).toLowerCase()] ?? 0;
      case 'getCount': return w.className === 'ListPanel' || w.className === 'TabPanel' ? w.items.length : this.kids(w).length;
      case 'getChild': { const k = this.kids(w); this.checkIndex(w, args[0], k.length); return k[args[0]]; }
      case 'getParent':
        if (w.parent) return w.parent;
        return id === this.viewport || w.detached ? 0 : this.viewportId();
      case 'findById': return [...this.descendants(w)].find((x) => x.props.id === args[0])?.id ?? 0;
      case 'findByClass': return [...this.descendants(w)].filter((x) => x.className === args[0]).map((x) => x.id);
      case 'toJson': return JSON.stringify(this.save(w));
      case 'fromJson': this.loadViewport(args[0], args[1]); return undefined;
      case 'save': {
        const text = JSON.stringify(this.save(w));
        return Promise.resolve().then(() => { this.saved.set(args[0], text); });
      }
      case 'load':
        return Promise.resolve().then(() => {
          if (!this.saved.has(args[0])) throw new WidgetError(`there is no saved viewport named '${args[0]}'`);
          this.loadViewport(this.saved.get(args[0]), args[1]);
        });
      case 'remove':
        if (w.parent) this.detach(w);
        else w.detached = true;
        return undefined;
      case 'clear':
        if (id === this.viewport) for (const k of this.kids(w)) this.widgets.get(k).detached = true;
        w.children = []; w.items = []; w.selected = -1;
        return undefined;
      case 'addButton': { const b = this.create('Button', [args[0]]); this.adopt(w, b); return b; }
      case 'getButtonBar':
        w.buttonBar ??= this.create('ButtonBar', []);
        return w.buttonBar;
      case 'addItem': w.items.push(args[0]); if (args[1]) w.itemHandlers = [...(w.itemHandlers ?? []), args[1]]; return undefined;
      case 'removeItem': this.checkIndex(w, args[0], w.items.length); w.items.splice(args[0], 1); return undefined;
      case 'setItem': this.checkIndex(w, args[0], w.items.length); w.items[args[0]] = args[1]; return undefined;
      case 'getItem': this.checkIndex(w, args[0], w.items.length); return w.items[args[0]];
      case 'select':
        if (args[0] !== -1) this.checkIndex(w, args[0], w.items.length);
        w.selected = args[0];
        this.fire(id, 'select', args[0]);
        return undefined;
      case 'getSelectedIndex': return w.selected;
      case 'getSelectedText': return w.items[w.selected] ?? '';
      case 'append': w.props.text += args[0]; return undefined;
      case 'fill': w.props.fill = true; return undefined;
      case 'open': case 'close': case 'maximize': case 'restore': case 'focus': case 'addSeparator':
        w.props.state = method; return undefined;
      default: break;
    }
    const set = /^set([A-Z]\w*)$/.exec(method);
    if (set) { w.props[set[1][0].toLowerCase() + set[1].slice(1)] = args[0]; return undefined; }
    const get = /^(?:get|is)([A-Z]\w*)$/.exec(method);
    if (get) {
      const key = get[1][0].toLowerCase() + get[1].slice(1);
      if (key in w.props) return w.props[key];
      return { left: 0, top: 0, width: 100, height: 24, position: 0.5, id: '' }[key] ?? (method.startsWith('is') ? false : '');
    }
    throw new Error(`FakeHost: no ${method} for ${cap(w.className)}`);
  }
}
