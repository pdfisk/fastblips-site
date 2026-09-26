// The 27 built-ins of spec section 10 (widgets: 10.1; Fetch and JSON: 10.2). Fixed arity, checked at compile time;
// argument types checked here, at the call.
//
// String positions are 1-based throughout, following VB.

import {
  NOTHING, CrumbArray, typeName, toStr, formatNumber,
  isNumber, isString, isArray,
} from './crumb-values.js';
import { hostFor, checkWidget, checkBox } from './widgets.js';
import { checkUrl, startFetch, followPath } from './fetch.js';

/** Thrown by a builtin; the VM turns it into a positioned runtime error. */
export class BuiltinError extends Error {}

const fail = (message) => { throw new BuiltinError(message); };

function wantNumber(name, position, value) {
  if (!isNumber(value)) {
    fail(`${name} expects a Number as argument ${position}, got ${typeName(value)}`);
  }
  return value;
}

function wantString(name, position, value) {
  if (!isString(value)) {
    fail(`${name} expects a String as argument ${position}, got ${typeName(value)}`);
  }
  return value;
}

function wantWholeNumber(name, position, value) {
  wantNumber(name, position, value);
  if (!Number.isInteger(value)) {
    fail(`${name} expects a whole Number as argument ${position}, got ${formatNumber(value)}`);
  }
  return value;
}

/** Widget builtins: the host (vm.gui), or a runtime error without one. */
const gui = (name, vm) => hostFor(vm, name, fail);

function wantWidget(name, position, vm, id) {
  wantWholeNumber(name, position, id);
  return checkWidget(gui(name, vm), name, id, fail);
}

/** Arguments from `first` on: left, top, width, height, all Numbers. */
function wantBox(name, first, values) {
  values.forEach((v, i) => wantNumber(name, first + i, v));
  return checkBox(name, values, fail);
}

/** AddButton / AddLabel(text, left, top, width, height) -> widget id. */
function addWidget(name, kind) {
  return {
    name,
    arity: 5,
    fn: ([text, ...box], vm) => {
      const host = gui(name, vm);
      if (isArray(text)) fail(`${name} cannot show an Array as its text`);
      return host.create(kind, toStr(text), ...wantBox(name, 2, box));
    },
  };
}

/** A JSON value as a Crumb value: objects and arrays stay JSON text, so
 *  they can be given to JsonGet again; null is Nothing. */
function fromJson(value) {
  if (value === null || value === undefined) return NOTHING;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;   // String, Number or Boolean
}

/** JsonGet / JsonCount / JsonKey: (json, path) checked and followed. */
function jsonAt(name, json, path) {
  wantString(name, 1, json);
  wantString(name, 2, path);
  return followPath(name, json, path, fail);
}

/**
 * name, arity and implementation. `vm` is passed so Rnd can use the injected
 * random source, which keeps tests deterministic.
 */
export const BUILTIN_LIST = [
  {
    name: 'Len',
    arity: 1,
    fn: ([s]) => wantString('Len', 1, s).length,
  },
  {
    name: 'Mid',
    arity: 3,
    fn: ([s, start, count]) => {
      wantString('Mid', 1, s);
      wantWholeNumber('Mid', 2, start);
      wantWholeNumber('Mid', 3, count);
      if (start < 1) fail(`Mid expects a start position of 1 or more, got ${formatNumber(start)}`);
      if (count < 0) fail(`Mid expects a count of 0 or more, got ${formatNumber(count)}`);
      return s.slice(start - 1, start - 1 + count);   // truncates past the end
    },
  },
  {
    name: 'InStr',
    arity: 2,
    fn: ([haystack, needle]) => {
      wantString('InStr', 1, haystack);
      wantString('InStr', 2, needle);
      return haystack.indexOf(needle) + 1;            // 0 when absent
    },
  },
  { name: 'UCase', arity: 1, fn: ([s]) => wantString('UCase', 1, s).toUpperCase() },
  { name: 'LCase', arity: 1, fn: ([s]) => wantString('LCase', 1, s).toLowerCase() },
  { name: 'Trim', arity: 1, fn: ([s]) => wantString('Trim', 1, s).trim() },
  { name: 'Str', arity: 1, fn: ([v]) => toStr(v) },
  {
    name: 'Val',
    arity: 1,
    fn: ([s]) => {
      wantString('Val', 1, s);
      // Must be a NUMBER literal exactly as section 2 defines it.
      if (!/^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(s)) {
        fail(`Val expects a numeric String, got "${s.length > 20 ? `${s.slice(0, 20)}...` : s}"`);
      }
      return Number(s);
    },
  },
  { name: 'Int', arity: 1, fn: ([n]) => Math.trunc(wantNumber('Int', 1, n)) },
  { name: 'Abs', arity: 1, fn: ([n]) => Math.abs(wantNumber('Abs', 1, n)) },
  {
    name: 'Sqr',
    arity: 1,
    fn: ([n]) => {
      wantNumber('Sqr', 1, n);
      if (n < 0) fail(`Sqr expects a Number of 0 or more, got ${formatNumber(n)}`);
      return Math.sqrt(n);
    },
  },
  { name: 'Rnd', arity: 0, fn: (_args, vm) => vm.random() },
  {
    name: 'Chr',
    arity: 1,
    fn: ([n]) => {
      wantWholeNumber('Chr', 1, n);
      if (n < 0 || n > 0x10ffff) fail(`Chr expects a code point in 0..1114111, got ${formatNumber(n)}`);
      return String.fromCodePoint(n);
    },
  },
  {
    name: 'Asc',
    arity: 1,
    fn: ([s]) => {
      wantString('Asc', 1, s);
      if (s.length === 0) fail('Asc expects a String of at least one character, got ""');
      return s.codePointAt(0);
    },
  },
  {
    name: 'UBound',
    arity: 1,
    fn: ([a]) => {
      if (!isArray(a)) fail(`UBound expects an Array, got ${typeName(a)}`);
      return a.bound;
    },
  },
  {
    // Transcript(value): writes value as a line to the transcript (the
    // Transcript window in the UI). Called as a statement; returns Nothing.
    name: 'Transcript',
    arity: 1,
    fn: ([v], vm) => {
      vm.transcript(toStr(v));
      return NOTHING;
    },
  },
  {
    // Sleep(n): pauses the program. A whole Number is seconds, a fractional
    // one is milliseconds: Sleep(2) is 2 s, Sleep(2.5) is 2.5 ms. The VM
    // yields; whoever is running it (VM.run or a Scheduler) does the waiting.
    name: 'Sleep',
    arity: 1,
    fn: ([n], vm) => {
      wantNumber('Sleep', 1, n);
      if (!Number.isFinite(n) || n < 0) {
        fail(`Sleep expects a Number of 0 or more, got ${formatNumber(n)}`);
      }
      vm.sleepMs = Number.isInteger(n) ? n * 1000 : n;
      return NOTHING;
    },
  },

  // ---- Widgets (need a screen: vm.gui). See ./widgets.js.
  addWidget('AddButton', 'button'),
  addWidget('AddLabel', 'label'),
  {
    // SetText(widget, value): the text shown, value converted as by Str.
    name: 'SetText',
    arity: 2,
    fn: ([id, text], vm) => {
      wantWidget('SetText', 1, vm, id);
      if (isArray(text)) fail('SetText cannot show an Array as a widget\'s text');
      vm.gui.setText(id, toStr(text));
      return NOTHING;
    },
  },
  {
    name: 'GetText',
    arity: 1,
    fn: ([id], vm) => vm.gui.getText(wantWidget('GetText', 1, vm, id)),
  },
  {
    // SetBounds(widget, left, top, width, height): moves and sizes it.
    name: 'SetBounds',
    arity: 5,
    fn: ([id, ...box], vm) => {
      wantWidget('SetBounds', 1, vm, id);
      vm.gui.setBounds(id, ...wantBox('SetBounds', 2, box));
      return NOTHING;
    },
  },
  {
    // OnClick(widget, "SubName"): calls that Sub each time the widget is
    // clicked. The Sub takes no arguments, or one: the widget clicked.
    name: 'OnClick',
    arity: 2,
    fn: ([id, subName], vm) => {
      wantWidget('OnClick', 1, vm, id);
      wantString('OnClick', 2, subName);
      const proc = vm.chunk.procedures.find((p) => p.name.toLowerCase() === subName.toLowerCase());
      if (!proc) fail(`OnClick: there is no Sub named '${subName}'`);
      if (proc.kind !== 'Sub') fail(`OnClick: '${proc.name}' is a ${proc.kind}; a click handler must be a Sub`);
      if (proc.arity > 1) fail(`OnClick: Sub '${proc.name}' takes ${proc.arity} arguments; a click handler takes none, or one (the widget)`);
      vm.listen(id, { proc }, (handler) => vm.gui.onClick(id, handler));
      return NOTHING;
    },
  },

  // ---- Fetch and JSON (spec 10.2). See ./fetch.js.
  {
    // Fetch(url): the body of the web page or API response at url, a
    // String. The program waits for it; other programs keep running.
    name: 'Fetch',
    arity: 1,
    fn: ([url], vm) => {
      wantString('Fetch', 1, url);
      const href = checkUrl('Fetch', url, fail);
      startFetch(vm, 'Fetch', href, {
        convert: (text) => text,
        onError: (v, message) => v.fail(message),
      });
      return NOTHING;
    },
  },
  {
    // JsonGet(json, path): the value at path in the JSON text json, e.g.
    // JsonGet(data, "current_weather.temperature"). A String, Number or
    // Boolean; an object or array comes back as JSON text; a JSON null,
    // or a path that is not there, is Nothing.
    name: 'JsonGet',
    arity: 2,
    fn: ([json, path]) => {
      const at = jsonAt('JsonGet', json, path);
      return at.found ? fromJson(at.value) : NOTHING;
    },
  },
  {
    // JsonCount(json, path): how many items the array at path holds, or
    // how many names the object there has; 0 for anything else or nothing.
    name: 'JsonCount',
    arity: 2,
    fn: ([json, path]) => {
      const at = jsonAt('JsonCount', json, path);
      if (!at.found || at.value === null || typeof at.value !== 'object') return 0;
      return Array.isArray(at.value) ? at.value.length : Object.keys(at.value).length;
    },
  },
  {
    // JsonKey(json, path, n): the name of the object's nth member (from 0),
    // at path, so a program can walk an object it does not know the names of.
    name: 'JsonKey',
    arity: 3,
    fn: ([json, path, n]) => {
      const at = jsonAt('JsonKey', json, path);
      wantWholeNumber('JsonKey', 3, n);
      if (!at.found || at.value === null || typeof at.value !== 'object' || Array.isArray(at.value)) {
        fail(`JsonKey expects the path "${path}" to lead to a JSON object`);
      }
      const keys = Object.keys(at.value);
      if (n < 0 || n >= keys.length) fail(`JsonKey: the object has ${keys.length} member${keys.length === 1 ? '' : 's'} (0 to ${keys.length - 1}), got ${formatNumber(n)}`);
      return keys[n];
    },
  },
];

/** lowercase name -> { index, name, arity, fn } */
export const BUILTINS = new Map(
  BUILTIN_LIST.map((builtin, index) => [builtin.name.toLowerCase(), { index, ...builtin }]),
);

export { NOTHING, CrumbArray };
