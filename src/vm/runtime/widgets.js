// GUI widgets for programs: the part both languages share.
//
// Every general-purpose widget of the FastBlip UI toolkit (docs/widgets.txt)
// is a class a program can make, as an object whose properties it sets by
// calling methods:
//
//   Crumb                              MiniPy
//   Dim label = New Label("Hello")     label = Label("Hello")
//   label.setWidth(100)                label.set_width(100)
//
// WIDGET_CLASSES lists the classes, their constructor arguments and their
// methods. A method has a Crumb name (camelCase) and a MiniPy name (the same
// in snake_case), the kinds of its arguments and the kind of its result.
// Each language checks and converts arguments in its own style
// (crumb-objects.js, python-builtins.js) and then calls callWidget() here.
// The value a program holds is a Widget (../values.js).
//
// The widgets themselves belong to the host (in the browser, the AppScreen
// of a LaunchWindow or of the ?run= page), passed to the VM as the `gui`
// option. A host implements four methods:
//
//   create(className, args) -> id   a new widget, placed on the screen;
//                                   for 'Viewport', the screen itself (the
//                                   same id every time: it is a singleton)
//   has(id) -> boolean              the id names a widget
//   classOf(id) -> className        for widgets the host made itself
//                                   (a Window's ButtonBar, addButton, ...)
//   call(id, method, args) -> value runs a method (its Crumb name)
//
// A call may return a promise (Viewport save / load, which use the
// database): the program waits for it, as for Fetch, and other programs keep
// running meanwhile. A method with `resolver` set gets one more argument
// after the program's: resolve(widgetId, handlerName, detailKind), which
// turns a handler named in saved JSON back into a callback (see fromJson).
// Every callback the VM gives the host carries the handler's name as
// callback.handlerName (null when it has none a program could look up), so
// the host can save it.
//
// Arguments reach the host as JS values: strings, numbers, booleans, widget
// ids, and, for a handler, a function the host calls with the event's value
// (or nothing). Results come back the same way; a widget result is an id, or
// 0 for none. A host rejects a bad call (an index out of range, ...) by
// throwing a WidgetError, which becomes a runtime error in the program.
// Without a host (the command line, a console) making a widget is a runtime
// error.

import { Widget } from '../values.js';

/** Thrown by a host for a call the program got wrong; message says why. */
export class WidgetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WidgetError';
  }
}

/** camelCase -> snake_case: setWidth -> set_width. */
export const snakeCase = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Argument kinds:
//   text      any value, converted to a string (Str / str())
//   position  a finite number, rounded to whole pixels
//   size      a finite number of 0 or more, rounded to whole pixels
//   number    a finite number
//   index     a whole number
//   boolean   True or False
//   widget    a widget object; the host gets its id
//   class     the name of a widget class (any case); the host gets the
//             class's own spelling
//   handler   a procedure to call on an event: a Sub name in Crumb, a
//             function in MiniPy. handler:<kind> passes the event's value,
//             of that kind, as the handler's second argument.
// Result kinds: text, int (a whole number), number, boolean, widget,
// widgets (a list of widgets: a Crumb Array, a MiniPy list); none for
// Nothing / None.

const method = (name, params = [], result = null, extra = {}) => Object.freeze({
  name, py: snakeCase(name), params: Object.freeze(params), result, ...extra,
});

/** Every widget, and the Viewport, has these: names and finding them. */
const FIND = [
  method('setId', ['text']),
  method('getId', [], 'text'),
  method('findById', ['text'], 'widget'),
  method('findByClass', ['class'], 'widgets'),
  method('toJson', [], 'text'),
];

/** Every widget has these. */
const COMMON = [
  ...FIND,
  method('setLeft', ['position']),
  method('setTop', ['position']),
  method('setWidth', ['size']),
  method('setHeight', ['size']),
  method('setBounds', ['position', 'position', 'size', 'size']),
  method('getLeft', [], 'int'),
  method('getTop', [], 'int'),
  method('getWidth', [], 'int'),
  method('getHeight', [], 'int'),
  method('setFlex', ['size']),
  method('fill'),
  method('setVisible', ['boolean']),
  method('isVisible', [], 'boolean'),
  method('setBackground', ['text']),
  method('setColor', ['text']),
  method('getParent', [], 'widget'),
  method('remove'),
];

const TEXT = [method('setText', ['text']), method('getText', [], 'text')];
const CLICK = [method('onClick', ['handler'])];
const CONTAINER = [
  method('add', ['widget']),
  method('getCount', [], 'int'),
  method('getChild', ['index'], 'widget'),
  method('clear'),
];
const ROW = [...CONTAINER, method('setPadding', ['size']), method('setSpacing', ['size'])];
const SPLIT = [
  method('setFirst', ['widget']),
  method('setSecond', ['widget']),
  method('getFirst', [], 'widget'),
  method('getSecond', [], 'widget'),
  method('setPosition', ['number']),
  method('getPosition', [], 'number'),
  method('onChange', ['handler:number']),
];
const TEXT_AREA = [
  ...TEXT,
  method('append', ['text']),
  method('setReadOnly', ['boolean']),
  method('isReadOnly', [], 'boolean'),
  method('focus'),
  method('onChange', ['handler:text']),
  method('onSubmit', ['handler']),
];

const cls = (name, params, methods, { common = COMMON } = {}) => {
  const all = [...common, ...methods];
  return Object.freeze({
    name,
    params: Object.freeze(params),
    methods: Object.freeze(all),
    byName: new Map(all.map((m) => [m.name.toLowerCase(), m])),
    byPy: new Map(all.map((m) => [m.py, m])),
  });
};

/** The widget classes a program can make, with their constructor arguments. */
export const WIDGET_CLASSES = Object.freeze([
  // The program's screen, the root of all its widgets. A singleton: every
  // New Viewport() / Viewport() is the same object.
  cls('Viewport', [], [
    method('getWidth', [], 'int'),
    method('getHeight', [], 'int'),
    method('setBackground', ['text']),
    method('setColor', ['text']),
    ...CONTAINER,
    method('fromJson', ['text'], null, { resolver: true }),
    method('save', ['text']),
    method('load', ['text'], null, { resolver: true }),
  ], { common: FIND }),
  cls('Label', ['text'], [...TEXT, ...CLICK]),
  cls('Button', ['text'], [
    ...TEXT, ...CLICK,
    method('setEnabled', ['boolean']),
    method('isEnabled', [], 'boolean'),
  ]),
  cls('Menu', ['text'], [
    ...TEXT,
    method('addItem', ['text', 'handler:text']),
    method('addSeparator'),
    method('clear'),
  ]),
  cls('Spacer', [], []),
  cls('Panel', [], CONTAINER),
  cls('HPanel', [], ROW),
  cls('VPanel', [], ROW),
  cls('ButtonBar', [], [...CONTAINER, method('addButton', ['text'], 'widget')]),
  cls('HSplitPanel', [], SPLIT),
  cls('VSplitPanel', [], SPLIT),
  cls('TabPanel', [], [
    method('addTab', ['text', 'widget']),
    method('select', ['index']),
    method('getSelectedIndex', [], 'int'),
    method('getSelectedText', [], 'text'),
    method('getCount', [], 'int'),
    method('onSelect', ['handler:int']),
  ]),
  cls('Window', ['text'], [
    method('setTitle', ['text']),
    method('getTitle', [], 'text'),
    method('setContent', ['widget']),
    method('getContent', [], 'widget'),
    method('getButtonBar', [], 'widget'),
    method('open'),
    method('close'),
    method('maximize'),
    method('restore'),
    method('isMaximized', [], 'boolean'),
    method('onClose', ['handler']),
  ]),
  cls('TextPanel', ['text'], TEXT_AREA),
  cls('MonacoPanel', ['text', 'text'], TEXT_AREA),
  cls('ListPanel', [], [
    method('addItem', ['text']),
    method('removeItem', ['index']),
    method('setItem', ['index', 'text']),
    method('getItem', ['index'], 'text'),
    method('getCount', [], 'int'),
    method('clear'),
    method('select', ['index']),
    method('getSelectedIndex', [], 'int'),
    method('getSelectedText', [], 'text'),
    method('setEmptyText', ['text']),
    method('onSelect', ['handler:int']),
  ]),
]);

/** className -> class */
export const CLASS_BY_NAME = new Map(WIDGET_CLASSES.map((c) => [c.name, c]));

/** lowercase className -> class */
const CLASS_BY_LOWER = new Map(WIDGET_CLASSES.map((c) => [c.name.toLowerCase(), c]));

/** A class name argument (any case) -> the class's own spelling, or fails. */
export function checkClassName(what, position, name, fail) {
  const c = CLASS_BY_LOWER.get(String(name).toLowerCase());
  if (!c) {
    fail(`${what}: there is no class '${name}' (argument ${position}); the classes are ${WIDGET_CLASSES.map((k) => k.name).sort().join(', ')}`);
  }
  return c.name;
}

/** The host, or fails if the VM has none. */
export function hostFor(vm, what, fail) {
  if (!vm.gui) {
    fail(`${what} needs a screen to put widgets on: run the program from a launch window (the console's Launch menu) or a ?run= page`);
  }
  return vm.gui;
}

/** A number argument of kind position / size / number, checked and rounded. */
export function checkNumber(what, kind, position, v, fail) {
  if (!Number.isFinite(v)) fail(`${what} expects a finite number as argument ${position}, got ${v}`);
  if (kind === 'size' && v < 0) fail(`${what} expects a size of 0 or more as argument ${position}, got ${v}`);
  return kind === 'number' ? v : Math.round(v);
}

/** The object for a host widget id (one object per id), or null for 0. */
export function wrapWidget(vm, id) {
  if (!id) return null;
  vm.widgetObjects ??= new Map();
  let w = vm.widgetObjects.get(id);
  if (!w) {
    const cls = CLASS_BY_NAME.get(vm.gui.classOf(id));
    w = new Widget(cls, id);
    vm.widgetObjects.set(id, w);
  }
  return w;
}

/** Runs a host call, turning a WidgetError into the language's error. */
function hostCall(fail, body) {
  try {
    return body();
  } catch (err) {
    if (err?.name === 'WidgetError') fail(err.message);
    throw err;
  }
}

/**
 * Makes a widget. args are already converted to JS values (all this
 * class's parameters are text).
 * lang = { what, fail } as for callWidget.
 */
export function createWidget(vm, cls, args, { what, fail }) {
  const gui = hostFor(vm, what, fail);
  const id = hostCall(fail, () => gui.create(cls.name, args));
  vm.widgetObjects ??= new Map();
  if (vm.widgetObjects.has(id)) return vm.widgetObjects.get(id);   // the Viewport
  const w = new Widget(cls, id);
  vm.widgetObjects.set(id, w);
  return w;
}

/**
 * A callback for the host: queues the handler with the widget (and the
 * event's value, converted to a language value) when the host calls it.
 */
function eventCallback(vm, w, handler, detail, lang) {
  vm.listening = true;
  const callback = (value) => vm.postEvent(handler, detail === null || value === undefined
    ? [w]
    : [w, lang.value(detail, value)]);
  callback.handlerName = lang.handlerName(handler);
  return callback;
}

/** What callWidget returns while the program waits for a promise. */
export const WAITING = Symbol('waiting');

/** A host result as a language value. */
function fromHost(vm, kind, result, lang) {
  if (kind === null || result === undefined) return null;
  if (kind === 'widget') return wrapWidget(vm, result);
  if (kind === 'widgets') return lang.list(result.map((id) => wrapWidget(vm, id)));
  return lang.value(kind, result);
}

/**
 * Calls method (from w.cls.methods) with arguments already checked and
 * converted by the language: numbers, strings, booleans, Widget objects,
 * class names and handlers ({ proc } or { fn }, what VM.postEvent takes).
 *   lang.what               the name to use in error messages
 *   lang.fail(m)            throws the language's runtime error
 *   lang.value(kind, v)     a result or event value as a language value
 *   lang.list(widgets)      a list of Widgets as a language value
 *   lang.handlerName(h)     the name to save for a handler, or null
 *   lang.resolve(name)      a handler from its saved name, or fails
 *   lang.onError(vm, m)     raises an error after a wait (save / load)
 * Returns the result as a language value (null for none), or WAITING when
 * the host returned a promise: the VM is then blocked, and the result is
 * pushed when it arrives.
 */
export function callWidget(vm, w, m, args, lang) {
  const gui = hostFor(vm, lang.what, lang.fail);
  if (!gui.has(w.id)) lang.fail(`${lang.what}: this ${w.cls.name} no longer exists`);
  const hostArgs = m.params.map((kind, i) => {
    const v = args[i];
    if (kind === 'widget') return v.id;
    if (kind.startsWith('handler')) return eventCallback(vm, w, v, kind.split(':')[1] ?? null, lang);
    return v;
  });
  if (m.resolver) {
    hostArgs.push((widgetId, name, detail) => eventCallback(
      vm, wrapWidget(vm, widgetId), lang.resolve(name), detail ?? null, lang,
    ));
  }
  const result = hostCall(lang.fail, () => gui.call(w.id, m.name, hostArgs));
  if (result && typeof result.then === 'function') {
    vm.block(
      Promise.resolve(result).then((v) => fromHost(vm, m.result, v, lang)),
      (v, message) => lang.onError(v, `${lang.what}: ${message}`),
    );
    return WAITING;
  }
  return fromHost(vm, m.result, result, lang);
}
