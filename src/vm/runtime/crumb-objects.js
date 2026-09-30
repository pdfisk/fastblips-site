// Crumb's objects (spec section 10.1): the widget classes made with New, and
// the methods called on them with a dot.
//
//   Dim label = New Label("Hello")      ' NEW_OBJECT <class> 1
//   label.setWidth(100)                 ' CALL_METHOD "setWidth" 1
//
// Class and method names are case-insensitive, like every Crumb name, and
// live in their own namespaces: a variable may be called label. The classes,
// the methods and what they do are shared with MiniPy (./widgets.js); this
// file checks arguments the Crumb way and reports Crumb runtime errors.

import { NOTHING, typeName, toStr, isNumber, isString, isArray, isObject } from './crumb-values.js';
import { WIDGET_CLASSES, WIDGET_METHODS, createWidget } from './widgets.js';
import { BuiltinError } from './crumb-builtins.js';

const fail = (message) => { throw new BuiltinError(message); };

/** The classes, in NEW_OBJECT's operand order. Every one takes one argument, its text. */
export const CLASS_LIST = WIDGET_CLASSES.map((cls) => ({ ...cls, arity: 1 }));

/** lowercase name -> { index, name, kind, box, arity } */
export const CLASSES = new Map(CLASS_LIST.map((cls, index) => [cls.name.toLowerCase(), { index, ...cls }]));

/** lowercase name -> { name, arity, params, call } */
export const METHODS = new Map(WIDGET_METHODS.map((m) => [m.name.toLowerCase(), { ...m, arity: m.params.length }]));

/** A value shown on a widget: anything but an Array or an object, as by Str. */
function wantText(what, position, value) {
  if (isArray(value) || isObject(value)) {
    fail(`${what} cannot show ${isArray(value) ? 'an Array' : `a ${typeName(value)}`} as a widget's text (argument ${position})`);
  }
  return toStr(value);
}

/** OnClick's handler: the name of a Sub taking no arguments, or one (the widget). */
function wantHandler(what, position, vm, name) {
  if (!isString(name)) fail(`${what} expects the name of a Sub (a String) as argument ${position}, got ${typeName(name)}`);
  const proc = vm.chunk.procedures.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!proc) fail(`${what}: there is no Sub named '${name}'`);
  if (proc.kind !== 'Sub') fail(`${what}: '${proc.name}' is a ${proc.kind}; a click handler must be a Sub`);
  if (proc.arity > 1) fail(`${what}: Sub '${proc.name}' takes ${proc.arity} arguments; a click handler takes none, or one (the widget)`);
  return { proc };
}

function convert(what, params, args, vm) {
  return params.map((kind, i) => {
    const v = args[i];
    switch (kind) {
      case 'text': return wantText(what, i + 1, v);
      case 'handler': return wantHandler(what, i + 1, vm, v);
      default:
        if (!isNumber(v)) fail(`${what} expects a Number as argument ${i + 1}, got ${typeName(v)}`);
        return v;
    }
  });
}

/** NEW_OBJECT: a new object of class CLASS_LIST[index]. */
export function newObject(vm, index, args) {
  const cls = CLASS_LIST[index];
  const what = `New ${cls.name}`;
  const [text] = convert(what, ['text'], args, vm);
  return createWidget(vm, WIDGET_CLASSES[index], text, what, fail);
}

/** CALL_METHOD: obj.name(args), name in any case; the result is a Crumb value. */
export function callMethod(vm, obj, name, args) {
  const method = METHODS.get(String(name).toLowerCase());
  if (!isObject(obj)) {
    fail(`cannot call method '${method?.name ?? name}' on ${obj === NOTHING ? 'Nothing' : `a ${typeName(obj)}`}: only an object has methods`);
  }
  if (!method) fail(`a ${obj.cls.name} has no method '${name}'`);
  if (args.length !== method.arity) {
    fail(`'${method.name}' takes ${method.arity} argument${method.arity === 1 ? '' : 's'}, found ${args.length}`);
  }
  const result = method.call(vm, obj, convert(method.name, method.params, args, vm), method.name, fail);
  return result === undefined ? NOTHING : result;
}
