// GUI widgets for programs: the part both languages share.
//
// A program makes a widget as an object and then works with it through its
// methods:
//
//   Crumb                              MiniPy
//   Dim label = New Label("Hello")     label = Label("Hello")
//   label.setWidth(100)                label.set_width(100)
//
// WIDGET_CLASSES lists the classes and WIDGET_METHODS their methods, each
// with its Crumb and its MiniPy name. Each language checks and converts the
// arguments in its own style (crumb-objects.js, python-builtins.js), then
// calls the shared implementation here. The value a program holds is a
// Widget (../values.js).
//
// The widgets themselves belong to the host (in the browser, the screen of a
// LaunchWindow or of the ?run= page), passed to the VM as the `gui` option.
// A host implements:
//
//   create(kind, text, left, top, width, height) -> id   kind: 'button' | 'label'
//   has(id) -> boolean
//   setText(id, text)
//   getText(id) -> string
//   setBounds(id, left, top, width, height)
//   onClick(id, callback)      calls callback() each time the widget is clicked
//
// Ids are whole numbers from 1; programs never see them. Positions and sizes
// are CSS pixels from the top left of the screen. Without a host (the
// command line, a console) making a widget is a runtime error.

import { Widget } from '../values.js';

/** The widget classes. box: where a new widget goes, and its size. */
export const WIDGET_CLASSES = Object.freeze([
  Object.freeze({ name: 'Button', kind: 'button', box: Object.freeze([0, 0, 100, 32]) }),
  Object.freeze({ name: 'Label', kind: 'label', box: Object.freeze([0, 0, 100, 24]) }),
]);

/** The host, or fails if the VM has none. */
export function hostFor(vm, what, fail) {
  if (!vm.gui) {
    fail(`${what} needs a screen to put widgets on: run the program from a launch window (the console's Launch menu) or a ?run= page`);
  }
  return vm.gui;
}

/** Makes a widget of class cls showing text (already a string). */
export function createWidget(vm, cls, text, what, fail) {
  const gui = hostFor(vm, what, fail);
  const box = [...cls.box];
  const id = gui.create(cls.kind, text, ...box);
  return new Widget(cls, id, box);
}

/** The host, checking the widget is still on it. */
function live(vm, widget, what, fail) {
  const gui = hostFor(vm, what, fail);
  if (!gui.has(widget.id)) fail(`${what}: this ${widget.cls.name} is no longer on the screen`);
  return gui;
}

/** A position or size: finite, a size 0 or more; rounded to whole pixels. */
function checkEdge(what, field, v, fail) {
  if (!Number.isFinite(v)) fail(`${what} expects a finite ${field}, got ${v}`);
  if ((field === 'width' || field === 'height') && v < 0) fail(`${what} expects a ${field} of 0 or more, got ${v}`);
  return Math.round(v);
}

/**
 * Checks a box (left, top, width, height), already converted to JS numbers.
 * Returns it rounded to whole pixels.
 */
export function checkBox(what, [left, top, width, height], fail) {
  for (const [name, v] of [['left', left], ['top', top], ['width', width], ['height', height]]) {
    if (!Number.isFinite(v)) fail(`${what} expects a finite ${name}, got ${v}`);
  }
  if (width < 0 || height < 0) fail(`${what} expects a width and height of 0 or more, got ${width} x ${height}`);
  return [left, top, width, height].map(Math.round);
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** setLeft / getLeft and the like, for one edge of the box. */
function edgeMethods(field) {
  return [
    {
      name: `set${cap(field)}`,
      py: `set_${field}`,
      params: ['number'],
      call(vm, w, [v], what, fail) {
        const gui = live(vm, w, what, fail);
        w[field] = checkEdge(what, field, v, fail);
        gui.setBounds(w.id, ...w.box);
      },
    },
    {
      name: `get${cap(field)}`,
      py: `get_${field}`,
      params: [],
      call(vm, w, _args, what, fail) {
        live(vm, w, what, fail);
        return w[field];
      },
    },
  ];
}

/**
 * The methods of every widget. params gives each argument's kind, which the
 * language checks and converts before call() sees it:
 *   text     a string (the language's own string conversion)
 *   number   a JS number
 *   handler  what vm.listen() takes: { proc } for Crumb, { fn } for MiniPy
 * call(vm, widget, args, what, fail) returns undefined (Nothing / None), a
 * string, or a whole number of pixels.
 */
export const WIDGET_METHODS = Object.freeze([
  {
    name: 'setText',
    py: 'set_text',
    params: ['text'],
    call(vm, w, [text], what, fail) { live(vm, w, what, fail).setText(w.id, text); },
  },
  {
    name: 'getText',
    py: 'get_text',
    params: [],
    call(vm, w, _args, what, fail) { return live(vm, w, what, fail).getText(w.id); },
  },
  ...edgeMethods('left'),
  ...edgeMethods('top'),
  ...edgeMethods('width'),
  ...edgeMethods('height'),
  {
    name: 'setBounds',
    py: 'set_bounds',
    params: ['number', 'number', 'number', 'number'],
    call(vm, w, box, what, fail) {
      const gui = live(vm, w, what, fail);
      [w.left, w.top, w.width, w.height] = checkBox(what, box, fail);
      gui.setBounds(w.id, ...w.box);
    },
  },
  {
    // Calls the handler each time the widget is clicked; the handler may
    // take one argument, the widget.
    name: 'onClick',
    py: 'on_click',
    params: ['handler'],
    call(vm, w, [handler], what, fail) {
      const gui = live(vm, w, what, fail);
      vm.listen(w, handler, (post) => gui.onClick(w.id, post));
    },
  },
].map((m) => Object.freeze(m)));
