// An in-memory widget host for the tests: the host interface of
// src/vm/runtime/widgets.js without a DOM. It models just enough of the
// browser host (src/ui/program-widgets.js) to check what the VM sends it:
// properties, parents and children, list items, tabs and event handlers.

import { WidgetError } from '../src/vm/runtime/widgets.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export class FakeHost {
  constructor() {
    this.widgets = new Map();
    this.next = 1;
    this.calls = [];
  }

  create(className, args) {
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
    child.parent = parent.id;
    parent.children.push(childId);
  }

  detach(child) {
    const parent = this.widgets.get(child.parent);
    parent.children = parent.children.filter((c) => c !== child.id);
    child.parent = null;
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
      case 'getCount': return w.className === 'ListPanel' || w.className === 'TabPanel' ? w.items.length : w.children.length;
      case 'getChild': this.checkIndex(w, args[0], w.children.length); return w.children[args[0]];
      case 'getParent': return w.parent ?? 0;
      case 'remove': if (w.parent) this.detach(w); return undefined;
      case 'clear': w.children = []; w.items = []; w.selected = -1; return undefined;
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
      return { left: 0, top: 0, width: 100, height: 24, position: 0.5 }[key] ?? (method.startsWith('is') ? false : '');
    }
    throw new Error(`FakeHost: no ${method} for ${cap(w.className)}`);
  }
}
