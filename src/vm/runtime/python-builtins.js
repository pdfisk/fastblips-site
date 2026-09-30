// MiniPy's runtime library: the exception hierarchy, the built-in
// functions, and the methods of list, dict and str.
//
// createPythonRuntime() is called once per compiled chunk. The compiler gives
// every built-in name a global slot, and the chunk's globalInit starts those
// slots holding the values made here.

import {
  NOTHING, PyTuple, PyDict, PyRange, PyClass, PyInstance, PyBuiltinFunction,
  isInt, isNum, toBig, toFloat, toIndex, typeName, isTruthy, pyStr, pyEquals,
} from './python-values.js';
import {
  add, order, normIndex, toSequenceArray,
} from './python-ops.js';
import { RuntimeFault } from '../faults.js';
import { UNBOUND, PyFunction, PyBoundMethod, Widget } from '../values.js';
import {
  hostFor, createWidget, callWidget, checkNumber, checkClassName, WidgetError, WAITING, WIDGET_CLASSES,
} from './widgets.js';
import { checkUrl, startFetch } from './fetch.js';

/**
 * Parsed JSON as MiniPy values: objects are dicts, arrays lists, whole
 * numbers ints (exactly, however large, where the host supports it) and
 * other numbers floats, null None.
 */
export function pyFromJsonText(text) {
  const ints = (key, value, context) => {
    if (typeof value === 'number' && context?.source !== undefined) {
      return /^-?\d+$/.test(context.source) ? BigInt(context.source) : value;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value) && context === undefined) return BigInt(value);
    return value;
  };
  const convert = (v) => {
    if (Array.isArray(v)) return v.map(convert);
    if (v !== null && typeof v === 'object' && typeof v !== 'bigint') {
      const d = new PyDict();
      for (const [k, item] of Object.entries(v)) d.set(k, convert(item));
      return d;
    }
    return v;
  };
  return convert(JSON.parse(text, ints));
}

export const EXCEPTION_NAMES = [
  'Exception', 'TypeError', 'ValueError', 'ZeroDivisionError', 'IndexError',
  'KeyError', 'AttributeError', 'NameError', 'RuntimeError', 'RecursionError',
  'OSError',
];

// ---- Widgets (need a screen: vm.gui). See ./widgets.js. A widget is an
// object: Label(text), HPanel(), Window(title), ... make one, and its
// methods (set_text, set_width, add, on_click, ...) change it.

/** One argument of the given kind (see widgets.js), checked and converted. */
function widgetArg(vm, what, kind, position, v) {
  const typeError = (wanted) => vm.raise('TypeError', `${what} expects ${wanted} as argument ${position}, not '${typeName(v)}'`);
  switch (kind) {
    case 'text': return pyStr(v);
    case 'boolean':
      if (typeof v !== 'boolean') typeError('a bool');
      return v;
    case 'widget':
      if (!(v instanceof Widget)) typeError('a widget');
      return v;
    case 'class':
      if (typeof v !== 'string') typeError('a class name (a str)');
      return checkClassName(what, position, v, (m) => vm.raise('ValueError', m));
    case 'index':
      if (!isInt(v) || typeof v === 'boolean') typeError('an int');
      return toIndex(v);
    default:
      if (kind.startsWith('handler')) {
        if (!(v instanceof PyFunction || v instanceof PyBoundMethod)) typeError('a function');
        return { fn: v };
      }
      if (!isNum(v) || typeof v === 'boolean') typeError('a number');
      return checkNumber(what, kind, position, toFloat(v), (m) => vm.raise('ValueError', m));
  }
}

function widgetArgs(vm, what, params, args) {
  if (args.length !== params.length) {
    vm.raise('TypeError', `${what} takes ${params.length} argument${params.length === 1 ? '' : 's'} (${args.length} given)`);
  }
  return params.map((kind, i) => widgetArg(vm, what, kind, i + 1, args[i]));
}

/** A result or event value as a MiniPy value: whole numbers are ints. */
const widgetValue = (kind, v) => (kind === 'int' ? BigInt(Math.trunc(v)) : v);

/** A module-level function's name, which a saved screen can name; else null. */
const handlerName = (h) => (h.fn instanceof PyFunction ? h.fn.name : null);

/** The module-level function called name, as a handler (for a loaded screen). */
function resolveHandler(vm, what, name) {
  const slot = vm.chunk.globalNames.indexOf(name);
  const fn = slot >= 0 ? vm.globals[slot] : undefined;
  if (!(fn instanceof PyFunction)) throw new WidgetError(`${what}: there is no function named '${name}'`);
  return { fn };
}

const widgetLang = (vm, what) => ({
  what,
  fail: (m) => vm.raise('ValueError', m),
  value: widgetValue,
  list: (widgets) => widgets,
  handlerName,
  resolve: (name) => resolveHandler(vm, what, name),
  onError: (v, m) => v.raise('OSError', m),
});

/** Label(text), HPanel(), ...: the class's constructor, a built-in function. */
function widgetClass(cls) {
  const what = `${cls.name}()`;
  return new PyBuiltinFunction(cls.name, (vm, args) => {
    hostFor(vm, what, (m) => vm.raise('RuntimeError', m));
    return createWidget(vm, cls, widgetArgs(vm, what, cls.params, args), widgetLang(vm, what));
  });
}

/** widget.name, found through GET_ATTR: a built-in bound to the widget. */
function widgetMethod(widget, name) {
  const m = widget.cls.byPy.get(name);
  if (!m) return undefined;
  const what = `${m.py}()`;
  return new PyBuiltinFunction(m.py, (vm, args) => {
    hostFor(vm, what, (msg) => vm.raise('RuntimeError', msg));
    const result = callWidget(vm, widget, m, widgetArgs(vm, what, m.params, args), widgetLang(vm, what));
    return result === WAITING ? NOTHING : result;   // a save / load pushes its result when done
  });
}

/** Built-in functions: name -> [minArgs, maxArgs, fn(vm, args)] */
const FUNCTIONS = {
  print: [0, Infinity, (vm, args) => { vm.out(args.map(pyStr).join(' ')); return NOTHING; }],

  len: [1, 1, (vm, [v]) => {
    if (typeof v === 'string' || Array.isArray(v)) return BigInt(v.length);
    if (v instanceof PyTuple) return BigInt(v.items.length);
    if (v instanceof PyDict) return BigInt(v.size);
    if (v instanceof PyRange) return BigInt(v.length);
    return vm.raise('TypeError', `object of type '${typeName(v)}' has no len()`);
  }],

  range: [1, 3, (vm, args) => {
    const n = args.map((a) => {
      if (!isInt(a)) vm.raise('TypeError', `'${typeName(a)}' object cannot be interpreted as an integer`);
      return toIndex(a);
    });
    if (n.length === 1) return new PyRange(0, n[0], 1);
    if (n.length === 2) return new PyRange(n[0], n[1], 1);
    if (n[2] === 0) vm.raise('ValueError', 'range() arg 3 must not be zero');
    return new PyRange(n[0], n[1], n[2]);
  }],

  str: [0, 1, (vm, args) => (args.length === 0 ? '' : pyStr(args[0]))],
  bool: [0, 1, (vm, args) => (args.length === 0 ? false : isTruthy(args[0]))],

  int: [0, 1, (vm, args) => {
    if (args.length === 0) return 0n;
    const v = args[0];
    if (isInt(v)) return toBig(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) vm.raise('ValueError', `cannot convert float ${pyStr(v)} to integer`);
      return BigInt(Math.trunc(v));
    }
    if (typeof v === 'string') {
      const text = v.trim().replace(/_/g, '');
      if (!/^[+-]?\d+$/.test(text)) {
        vm.raise('ValueError', `invalid literal for int() with base 10: ${JSON.stringify(v)}`);
      }
      return BigInt(text);
    }
    return vm.raise('TypeError', `int() argument must be a string or a number, not '${typeName(v)}'`);
  }],

  float: [0, 1, (vm, args) => {
    if (args.length === 0) return 0;
    const v = args[0];
    if (isNum(v)) return toFloat(v);
    if (typeof v === 'string') {
      const text = v.trim().toLowerCase();
      const special = { inf: Infinity, '+inf': Infinity, '-inf': -Infinity, nan: NaN };
      if (text in special) return special[text];
      const n = Number(text);
      if (text === '' || Number.isNaN(n)) vm.raise('ValueError', `could not convert string to float: ${JSON.stringify(v)}`);
      return n;
    }
    return vm.raise('TypeError', `float() argument must be a string or a number, not '${typeName(v)}'`);
  }],

  list: [0, 1, (vm, args) => (args.length === 0 ? [] : toSequenceArray(vm, args[0]).slice())],
  tuple: [0, 1, (vm, args) => new PyTuple(args.length === 0 ? [] : toSequenceArray(vm, args[0]).slice())],
  dict: [0, 1, (vm, args) => {
    if (args.length === 0) return new PyDict();
    if (args[0] instanceof PyDict) return args[0].clone();
    const d = new PyDict();
    for (const pair of toSequenceArray(vm, args[0])) {
      const [k, v] = toSequenceArray(vm, pair);
      d.set(k, v);
    }
    return d;
  }],

  type: [1, 1, (vm, [v]) => {
    if (v instanceof PyInstance) return v.cls;
    return vm.raise('TypeError', `type() of built-in values is not supported (got '${typeName(v)}')`);
  }],
  isinstance: [2, 2, (vm, [v, cls]) => {
    const classes = cls instanceof PyTuple ? cls.items : [cls];
    return classes.some((c) => c instanceof PyClass && v instanceof PyInstance && v.cls.isSubclassOf(c));
  }],

  abs: [1, 1, (vm, [v]) => {
    if (isInt(v)) { const b = toBig(v); return b < 0n ? -b : b; }
    if (typeof v === 'number') return Math.abs(v);
    return vm.raise('TypeError', `bad operand type for abs(): '${typeName(v)}'`);
  }],
  min: [1, Infinity, (vm, args) => extreme(vm, args, 'min')],
  max: [1, Infinity, (vm, args) => extreme(vm, args, 'max')],
  sum: [1, 2, (vm, args) => {
    let total = args.length > 1 ? args[1] : 0n;
    for (const v of toSequenceArray(vm, args[0])) total = add(vm, total, v);
    return total;
  }],
  sorted: [1, 1, (vm, [seq]) => sortValues(vm, toSequenceArray(vm, seq).slice())],

  // dir([object]): with no argument, the names bound in the current scope;
  // with one, the attribute names of the object. Always a sorted list of str.
  dir: [0, 1, (vm, args) => (args.length === 0 ? scopeNames(vm) : attributeNames(args[0])).sort()],

  // sleep(seconds): pauses the program. The VM yields; whoever runs it (the
  // loader's run() or a Scheduler) does the waiting, exactly as for Crumb's
  // Sleep.
  sleep: [1, 1, (vm, [s]) => {
    if (!isNum(s)) vm.raise('TypeError', `sleep() argument must be a number, not '${typeName(s)}'`);
    const seconds = toFloat(s);
    if (!(seconds >= 0) || !Number.isFinite(seconds)) vm.raise('ValueError', 'sleep length must be non-negative');
    vm.sleepMs = seconds * 1000;
    return NOTHING;
  }],

  // transcript(*values): print() to the transcript instead of the program's
  // output. The values are written space-separated as one line, converted as
  // str() does; with no values it writes an empty line. Like Crumb's
  // Transcript, a host without a transcript sends it to the output.
  transcript: [0, Infinity, (vm, args) => { vm.transcript(args.map(pyStr).join(' ')); return NOTHING; }],

  // fetch(url): the response at url. JSON comes back as dicts, lists, str,
  // int, float, bool and None; anything else as a str. The program waits
  // for it (other programs keep running); a failed request raises OSError.
  fetch: [1, 1, (vm, [url]) => {
    if (typeof url !== 'string') vm.raise('TypeError', `fetch() expects a URL (a str), not '${typeName(url)}'`);
    const href = checkUrl('fetch()', url, (m) => vm.raise('ValueError', m));
    startFetch(vm, 'fetch()', href, {
      convert: (text) => {
        try {
          return pyFromJsonText(text);
        } catch {
          return text;
        }
      },
      onError: (v, message) => v.raise('OSError', message),
    });
    return NOTHING;
  }],
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/** Every name a MiniPy program starts with, in global-slot order. */
export const BUILTIN_NAMES = [...EXCEPTION_NAMES, ...FUNCTION_NAMES, ...WIDGET_CLASSES.map((c) => c.name), '__builtins__'];

function builtin(name, [min, max, fn]) {
  return new PyBuiltinFunction(name, (vm, args) => {
    if (args.length < min || args.length > max) {
      const expected = min === max ? `${min}` : (max === Infinity ? `at least ${min}` : `${min} to ${max}`);
      vm.raise('TypeError', `${name}() takes ${expected} argument${expected === '1' ? '' : 's'} (${args.length} given)`);
    }
    return fn(vm, args);
  });
}

/** Names bound in the innermost scope: the running function or class body,
 *  or else the module (leaving out built-ins the program hasn't rebound). */
function scopeNames(vm) {
  const names = [];
  const frame = vm.frames[vm.frames.length - 1];
  if (frame) {
    frame.proc.slotNames.forEach((name, slot) => {
      if (frame.slots[slot] !== UNBOUND && !name.startsWith('$')) names.push(name);
    });
    return names;
  }
  const { globalNames, globalInit } = vm.chunk;
  globalNames.forEach((name, slot) => {
    const value = vm.globals[slot];
    const bound = value !== UNBOUND && (value !== globalInit[slot] || name === '__builtins__');
    if (bound && !name.startsWith('$')) names.push(name);
  });
  return names;
}

/** The attribute names getAttr() would find on `obj`. */
function attributeNames(obj) {
  const names = new Set();
  const addClass = (cls) => {
    for (let c = cls; c; c = c.base) for (const name of c.methods.keys()) names.add(name);
  };
  if (obj instanceof PyInstance) {
    for (const name of obj.attrs.keys()) if (name !== '__msg__') names.add(name);
    addClass(obj.cls);
  } else if (obj instanceof PyClass) {
    addClass(obj);
  } else if (Array.isArray(obj)) {
    LIST_METHODS.forEach((n) => names.add(n));
  } else if (obj instanceof PyDict) {
    DICT_METHODS.forEach((n) => names.add(n));
  } else if (typeof obj === 'string') {
    STR_METHODS.forEach((n) => names.add(n));
  }
  return [...names];
}

function sortValues(vm, items) {
  // A merge sort on the MiniPy ordering, so a TypeError from a bad
  // comparison surfaces as a MiniPy exception.
  if (items.length < 2) return items;
  const mid = items.length >> 1;
  const left = sortValues(vm, items.slice(0, mid));
  const right = sortValues(vm, items.slice(mid));
  const out = [];
  while (left.length && right.length) {
    out.push(order(vm, '<', right[0], left[0]) ? right.shift() : left.shift());
  }
  return out.concat(left, right);
}

function extreme(vm, args, which) {
  const seq = args.length === 1 ? toSequenceArray(vm, args[0]) : args;
  if (seq.length === 0) vm.raise('ValueError', `${which}() arg is an empty sequence`);
  let best = seq[0];
  for (let i = 1; i < seq.length; i += 1) {
    if (order(vm, which === 'max' ? '>' : '<', seq[i], best)) best = seq[i];
  }
  return best;
}

/** A method of a built-in type. Arguments of the wrong kind or number that
 *  slip past a method's own checks become a TypeError, never a host crash. */
function bf(name, fn) {
  return new PyBuiltinFunction(name, (vm, args) => {
    try {
      return fn(vm, args);
    } catch (err) {
      if (err instanceof Error && !(err instanceof RuntimeFault)) {
        return vm.raise('TypeError', `${name}() got arguments it cannot use (${args.length} given)`);
      }
      throw err;
    }
  });
}

const LIST_METHODS = ['append', 'extend', 'pop', 'insert', 'remove', 'index', 'count', 'reverse', 'sort', 'clear', 'copy'];
const DICT_METHODS = ['get', 'keys', 'values', 'items', 'pop', 'update', 'setdefault', 'clear', 'copy'];
const STR_METHODS = [
  'upper', 'lower', 'strip', 'lstrip', 'rstrip', 'split', 'join', 'replace', 'startswith',
  'endswith', 'find', 'count', 'isdigit', 'isalpha', 'format',
];

function listMethod(list, name) {
  switch (name) {
    case 'append': return bf('append', (vm, args) => { list.push(args[0]); return NOTHING; });
    case 'extend': return bf('extend', (vm, args) => { list.push(...toSequenceArray(vm, args[0])); return NOTHING; });
    case 'pop': return bf('pop', (vm, args) => {
      if (list.length === 0) vm.raise('IndexError', 'pop from empty list');
      const i = args.length ? normIndex(vm, args[0], list.length) : list.length - 1;
      if (i < 0 || i >= list.length) vm.raise('IndexError', 'pop index out of range');
      return list.splice(i, 1)[0];
    });
    case 'insert': return bf('insert', (vm, args) => {
      let i = normIndex(vm, args[0], list.length);
      i = Math.min(Math.max(0, i), list.length);
      list.splice(i, 0, args[1]);
      return NOTHING;
    });
    case 'remove': return bf('remove', (vm, args) => {
      const i = list.findIndex((x) => pyEquals(x, args[0]));
      if (i === -1) vm.raise('ValueError', 'list.remove(x): x not in list');
      list.splice(i, 1);
      return NOTHING;
    });
    case 'index': return bf('index', (vm, args) => {
      const i = list.findIndex((x) => pyEquals(x, args[0]));
      if (i === -1) vm.raise('ValueError', `${pyStr(args[0])} is not in list`);
      return BigInt(i);
    });
    case 'count': return bf('count', (vm, args) => BigInt(list.filter((x) => pyEquals(x, args[0])).length));
    case 'reverse': return bf('reverse', () => { list.reverse(); return NOTHING; });
    case 'sort': return bf('sort', (vm) => {
      const sorted = sortValues(vm, list.slice());
      list.splice(0, list.length, ...sorted);
      return NOTHING;
    });
    case 'clear': return bf('clear', () => { list.length = 0; return NOTHING; });
    case 'copy': return bf('copy', () => list.slice());
    default: return undefined;
  }
}

function dictMethod(dict, name) {
  switch (name) {
    case 'get': return bf('get', (vm, args) => (dict.has(args[0]) ? dict.get(args[0]) : (args.length > 1 ? args[1] : NOTHING)));
    case 'keys': return bf('keys', () => dict.keys());
    case 'values': return bf('values', () => dict.values());
    case 'items': return bf('items', () => dict.entries().map(([k, v]) => new PyTuple([k, v])));
    case 'pop': return bf('pop', (vm, args) => {
      if (dict.has(args[0])) { const v = dict.get(args[0]); dict.delete(args[0]); return v; }
      if (args.length > 1) return args[1];
      return vm.raise('KeyError', pyStr(args[0]));
    });
    case 'update': return bf('update', (vm, args) => { for (const [k, v] of args[0].entries()) dict.set(k, v); return NOTHING; });
    case 'setdefault': return bf('setdefault', (vm, args) => {
      if (!dict.has(args[0])) dict.set(args[0], args.length > 1 ? args[1] : NOTHING);
      return dict.get(args[0]);
    });
    case 'clear': return bf('clear', () => { dict.map.clear(); return NOTHING; });
    case 'copy': return bf('copy', () => dict.clone());
    default: return undefined;
  }
}

function strMethod(s, name) {
  const wantStr = (vm, v, what) => {
    if (typeof v !== 'string') vm.raise('TypeError', `${what} must be str, not ${typeName(v)}`);
    return v;
  };
  switch (name) {
    case 'upper': return bf('upper', () => s.toUpperCase());
    case 'lower': return bf('lower', () => s.toLowerCase());
    case 'strip': return bf('strip', () => s.trim());
    case 'lstrip': return bf('lstrip', () => s.replace(/^\s+/, ''));
    case 'rstrip': return bf('rstrip', () => s.replace(/\s+$/, ''));
    case 'split': return bf('split', (vm, args) => (args.length && args[0] !== NOTHING
      ? s.split(wantStr(vm, args[0], 'separator'))
      : s.split(/\s+/).filter((x) => x.length)));
    case 'join': return bf('join', (vm, args) => toSequenceArray(vm, args[0]).map((v) => wantStr(vm, v, 'sequence item')).join(s));
    case 'replace': return bf('replace', (vm, args) => s.split(wantStr(vm, args[0], 'old')).join(wantStr(vm, args[1], 'new')));
    case 'startswith': return bf('startswith', (vm, args) => s.startsWith(wantStr(vm, args[0], 'prefix')));
    case 'endswith': return bf('endswith', (vm, args) => s.endsWith(wantStr(vm, args[0], 'suffix')));
    case 'find': return bf('find', (vm, args) => BigInt(s.indexOf(wantStr(vm, args[0], 'substring'))));
    case 'count': return bf('count', (vm, args) => BigInt(s.split(wantStr(vm, args[0], 'substring')).length - 1));
    case 'isdigit': return bf('isdigit', () => /^\d+$/.test(s));
    case 'isalpha': return bf('isalpha', () => /^[A-Za-z]+$/.test(s));
    case 'format': return bf('format', (vm, args) => { let i = 0; return s.replace(/\{\}/g, () => pyStr(args[i++])); });
    default: return undefined;
  }
}

/**
 * Gives a MiniPy chunk its live runtime: a fresh runtime library, the
 * built-in values in their global slots (globalInit), and UNBOUND as the
 * starting value of every other slot. The compiler calls this, and so does
 * chunkFromJson (src/vm/chunk-json.js) for a chunk loaded from compiled code,
 * so both give the VM the same thing. Returns the chunk.
 */
export function attachPythonRuntime(chunk) {
  const runtime = createPythonRuntime();
  chunk.runtime = runtime;
  chunk.globalInit = chunk.globalNames.map((name) => (runtime.globals.has(name) ? runtime.globals.get(name) : UNBOUND));
  chunk.initialSlot = UNBOUND;
  return chunk;
}

/**
 * A fresh runtime library for one chunk.
 * @returns {{ globals: Map<string, any>, exceptionClasses: object, method: Function }}
 */
export function createPythonRuntime() {
  const Exception = new PyClass('Exception', null);
  const exceptionClasses = { Exception };
  for (const name of EXCEPTION_NAMES.slice(1)) exceptionClasses[name] = new PyClass(name, Exception);

  const globals = new Map();
  for (const name of EXCEPTION_NAMES) globals.set(name, exceptionClasses[name]);
  for (const [name, spec] of Object.entries(FUNCTIONS)) globals.set(name, builtin(name, spec));
  // The widget classes: Label(text), HPanel(), Window(title), ...
  for (const cls of WIDGET_CLASSES) globals.set(cls.name, widgetClass(cls));

  // __builtins__: a read-mostly stand-in for Python's builtins module. Its
  // attributes are the built-in values as they were at startup, so
  // __builtins__.print still works after a program rebinds print.
  const moduleClass = new PyClass('module', null);
  moduleClass.isModule = true;
  const builtinsModule = new PyInstance(moduleClass);
  builtinsModule.attrs.set('__name__', 'builtins');
  for (const [name, value] of globals) builtinsModule.attrs.set(name, value);
  globals.set('__builtins__', builtinsModule);

  return {
    globals,
    exceptionClasses,
    /** Methods of the built-in types, reached through GET_ATTR. */
    method(obj, name) {
      if (Array.isArray(obj)) return listMethod(obj, name);
      if (obj instanceof PyDict) return dictMethod(obj, name);
      if (typeof obj === 'string') return strMethod(obj, name);
      if (obj instanceof Widget) return widgetMethod(obj, name);
      return undefined;
    },
  };
}
