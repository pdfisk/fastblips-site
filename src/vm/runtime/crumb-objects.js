// Crumb's objects (spec section 10.1): the widget classes made with New, and
// the methods called on them with a dot.
//
//   Dim label = New Label("Hello")      ' NEW_OBJECT <class> 1
//   label.setWidth(100)                 ' CALL_METHOD "setWidth" 1
//
// Class and method names are case-insensitive, like every Crumb name, and
// live in their own namespaces: a variable may be called label. The classes,
// their methods and what they do are shared with MiniPy (./widgets.js); this
// file checks arguments the Crumb way and reports Crumb runtime errors.

import {
  NOTHING, CrumbArray, typeName, toStr, formatNumber, isNumber, isString, isBoolean, isArray, isObject,
} from './crumb-values.js';
import {
  WIDGET_CLASSES, WidgetError, createWidget, callWidget, checkNumber, checkClassName,
} from './widgets.js';
import { BuiltinError } from './crumb-builtins.js';

const fail = (message) => { throw new BuiltinError(message); };

/** The classes, in NEW_OBJECT's operand order. */
export const CLASS_LIST = WIDGET_CLASSES.map((cls) => ({ ...cls, arity: cls.params.length }));

/** lowercase name -> { index, name, params, arity, ... } */
export const CLASSES = new Map(CLASS_LIST.map((cls, index) => [cls.name.toLowerCase(), { ...cls, index }]));

/**
 * Every method name any class has: lowercase name -> { name, arities }, for
 * the load-time check. Which class the object is only shows at run time.
 */
export const METHODS = new Map();
for (const cls of WIDGET_CLASSES) {
  for (const m of cls.methods) {
    const key = m.name.toLowerCase();
    if (!METHODS.has(key)) METHODS.set(key, { name: m.name, arities: new Set() });
    METHODS.get(key).arities.add(m.params.length);
  }
}

/** The Sub named name, as a handler: it takes up to two arguments (the
 *  widget and the event's value). Calls fail(message) if there is none. */
function findHandler(what, vm, name, failWith) {
  const proc = vm.chunk.procedures.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!proc) failWith(`${what}: there is no Sub named '${name}'`);
  if (proc.kind !== 'Sub') failWith(`${what}: '${proc.name}' is a ${proc.kind}; an event handler must be a Sub`);
  if (proc.arity > 2) {
    failWith(`${what}: Sub '${proc.name}' takes ${proc.arity} arguments; an event handler takes none, one (the widget) or two (the widget and the event's value)`);
  }
  return { proc };
}

function wantHandler(what, position, vm, name) {
  if (!isString(name)) fail(`${what} expects the name of a Sub (a String) as argument ${position}, got ${typeName(name)}`);
  return findHandler(what, vm, name, fail);
}

/** Checks and converts one argument of the given kind (see widgets.js). */
function convert(what, kind, position, v, vm) {
  switch (kind) {
    case 'text':
      if (isArray(v) || isObject(v)) {
        fail(`${what} cannot show ${isArray(v) ? 'an Array' : `a ${typeName(v)}`} as text (argument ${position})`);
      }
      return toStr(v);
    case 'boolean':
      if (!isBoolean(v)) fail(`${what} expects a Boolean as argument ${position}, got ${typeName(v)}`);
      return v;
    case 'widget':
      if (!isObject(v)) fail(`${what} expects a widget as argument ${position}, got ${typeName(v)}`);
      return v;
    case 'class':
      if (!isString(v)) fail(`${what} expects a class name (a String) as argument ${position}, got ${typeName(v)}`);
      return checkClassName(what, position, v, fail);
    case 'index':
      if (!isNumber(v)) fail(`${what} expects a Number as argument ${position}, got ${typeName(v)}`);
      if (!Number.isInteger(v)) fail(`${what} expects a whole Number as argument ${position}, got ${formatNumber(v)}`);
      return v;
    default:
      if (kind.startsWith('handler')) return wantHandler(what, position, vm, v);
      if (!isNumber(v)) fail(`${what} expects a Number as argument ${position}, got ${typeName(v)}`);
      return checkNumber(what, kind, position, v, fail);
  }
}

const convertAll = (what, params, args, vm) => params.map((kind, i) => convert(what, kind, i + 1, args[i], vm));

/** How widgets.js talks Crumb: results, lists, handler names, errors. */
function crumbLang(vm, what) {
  return {
    what,
    fail,
    value: (_kind, v) => v,          // every kind is already a Crumb value
    list: (widgets) => {
      const array = new CrumbArray(widgets.length - 1);
      widgets.forEach((w, i) => { array.elements[i] = w; });
      return array;
    },
    handlerName: (handler) => handler.proc.name,
    resolve: (name) => findHandler(what, vm, name, (m) => { throw new WidgetError(m); }),
    onError: (v, message) => v.fail(message),
  };
}

/** NEW_OBJECT: a new object of class CLASS_LIST[index]. */
export function newObject(vm, index, args) {
  const cls = WIDGET_CLASSES[index];
  const what = `New ${cls.name}`;
  return createWidget(vm, cls, convertAll(what, cls.params, args, vm), crumbLang(vm, what));
}

/** CALL_METHOD: obj.name(args), name in any case; the result is a Crumb value. */
export function callMethod(vm, obj, name, args) {
  const known = METHODS.get(String(name).toLowerCase());
  const shown = known?.name ?? name;
  if (!isObject(obj)) {
    fail(`cannot call method '${shown}' on ${obj === NOTHING ? 'Nothing' : `a ${typeName(obj)}`}: only an object has methods`);
  }
  const m = obj.cls.byName.get(String(name).toLowerCase());
  if (!m) fail(`a ${obj.cls.name} has no method '${shown}'`);
  if (args.length !== m.params.length) {
    fail(`'${m.name}' of a ${obj.cls.name} takes ${m.params.length} argument${m.params.length === 1 ? '' : 's'}, found ${args.length}`);
  }
  return callWidget(vm, obj, m, convertAll(m.name, m.params, args, vm), crumbLang(vm, m.name)) ?? NOTHING;
}
