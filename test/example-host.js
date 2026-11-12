// A harness that runs a program from examples/ on the real widget host
// (src/ui/program-widgets.js, the one the browser uses) over a small stand-in
// for the DOM, so a test can use the program as a person would: click a
// button, type in a field, pick from a list, and look at what the widgets
// say afterwards. It models the DOM only as far as the toolkit needs; it
// draws nothing, so what it proves is that every call a program makes is a
// real one and does what the example says it does, not how it looks.
//
//   const app = await runExample('form-fields.py');
//   app.type(app.byId('name'), 'Ann');
//   app.click(app.byId('send'));
//   assert.equal(app.byId('status').text, 'Hello, Ann');

import { readFileSync } from 'node:fs';
import { compile } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';

export class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.readOnly = false;
    this.textContent = '';
    this.value = '';
    this.placeholder = '';
    this.selectedIndex = -1;
    this.scrollWidth = 60;
    this.scrollHeight = 400;
    this.scrollTop = 0;
    this.clientWidth = 400;
    this.clientHeight = 300;
    const names = new Set();
    this.classList = {
      add: (...n) => n.forEach((x) => names.add(x)),
      contains: (n) => names.has(n),
      remove: (...n) => n.forEach((x) => names.delete(x)),
      toggle: (n, on) => ((on ?? !names.has(n)) ? names.add(n) : names.delete(n)),
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...c) { this.children.push(...c); }
  prepend(...c) { this.children.unshift(...c); }
  replaceChildren(...c) { this.children = c; }
  contains(other) { return other === this || this.children.some((c) => c.contains?.(other)); }
  remove() {}
  setAttribute() {}
  removeAttribute() {}
  getAttribute() { return null; }
  querySelector() { return null; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  setPointerCapture() {}
  focus() { this.focused = true; }
  select() { this.selected = true; }
  scrollIntoView() {}
}

/** Installs the fake DOM and the browser globals the toolkit reads. Once. */
export function installDom() {
  if (globalThis.document?.isFake) return;
  const html = new FakeElement('html');
  html.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
  globalThis.window = globalThis;
  globalThis.innerWidth = 1024;
  globalThis.innerHeight = 768;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.document = {
    isFake: true,
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
    body: new FakeElement('body'),
    documentElement: html,
    addEventListener() {},
    removeEventListener() {},
  };
}

/** Runs the VM until the program ends or is waiting for an event. */
export function settle(vm) {
  while (!vm.runSlice(100000)) if (vm.waiting) return;
}

/**
 * Compiles and starts examples/<file> on a screen of width by height.
 * Returns the program's VM and host with helpers to drive it.
 */
export async function runExample(file, { width = 400, height = 300 } = {}) {
  installDom();
  const { ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js');
  const source = readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8');
  const compiled = compile(source, { filename: file });
  if (!compiled.chunk) throw new Error(`${file} does not compile: ${JSON.stringify(compiled.loadErrors)}`);
  const layer = new FreeLayer();
  layer.setBounds(0, 0, width, height);
  const host = new ProgramWidgetHost(layer);
  const out = [];
  const vm = new VM(compiled.chunk, { gui: host, out: (t) => out.push(t), transcript: (t) => out.push(t) });
  settle(vm);
  const app = {
    vm, host, layer, out, source,
    /** Lets the program run what its handlers have queued. */
    settle: () => settle(vm),
    /** The widget the program gave this id (setId), or throws. A closed Window is not on the screen, so the program's own list is searched too. */
    byId(id) {
      const w = layer.findById(id) ?? host.widgets.find((x) => x.id === id);
      if (!w) throw new Error(`${file}: no widget with id '${id}'`);
      return w;
    },
    /** Every widget of a program class ('Button', ...), in order. */
    all: (cls) => layer.findByClass(cls),
    /** A tap or click on a widget. */
    click(w) {
      (w.button?.element ?? w.element).dispatchEvent(new Event('click'));
      settle(vm);
    },
    /** A tap on a NavigationBar's 'back' or 'action' button. */
    tap(bar, which) {
      (which === 'back' ? bar.backButton : bar.actionButton).dispatchEvent(new Event('click'));
      settle(vm);
    },
    /** The user types text into a TextField, PasswordField or TextArea. */
    type(w, text) {
      w.element.value = text;
      w.element.dispatchEvent(new Event('input'));
      settle(vm);
    },
    /** The user types into a TextPanel or MonacoPanel. */
    typePanel(w, text) {
      w.textArea.value = text;
      w.textArea.dispatchEvent(new Event('input'));
      settle(vm);
    },
    /** Ctrl+Enter or Enter, as the widget takes it for submitting. */
    submit(w, { ctrl = false } = {}) {
      const target = w.textArea ?? w.element;
      target.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter', ctrlKey: ctrl }));
      settle(vm);
    },
    /** The user picks row / item / tab / page i of a ListPanel, SelectBox, TabPanel, Stack or Carousel. */
    pick(w, i) {
      w.select(i);
      settle(vm);
    },
    /** The user chooses menu item i (a Menu's or a SplitButton's). */
    choose(w, i) {
      w.items[i].action();
      settle(vm);
    },
  };
  return app;
}
