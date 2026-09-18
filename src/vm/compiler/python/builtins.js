// MiniPy built-in functions, the exception hierarchy and the
// list/dict/str method tables.

import {
  PyFloat,
  mkFloat,
  isNum,
  isInt,
  numVal,
  PyTuple,
  PyDict,
  PyRange,
  PyFunction,
  PyClass,
  PyInstance,
  PyBoundMethod,
  PyBuiltinFunction,
  typeName,
  isTruthy,
  numToStr,
  pyStr,
  pyRepr,
  pyEquals,
  pyIs,
} from './values.js';

function bf(name, fn) { return new PyBuiltinFunction(name, fn); }

function toNumberArg(vm, v, line, who) {
  if (!isNum(v)) vm.raise('TypeError', `${who}() argument must be a number, not '${typeName(v)}'`, line);
  return numVal(v);
}

function installBuiltins(vm) {
  // ---- exception hierarchy ----
  const Exception = new PyClass('Exception', null);
  const names = ['TypeError', 'ValueError', 'ZeroDivisionError', 'IndexError', 'KeyError', 'AttributeError', 'NameError', 'RuntimeError'];
  const classes = { Exception };
  for (const n of names) classes[n] = new PyClass(n, Exception);
  for (const n of ['Exception', ...names]) vm.globals.set(n, classes[n]);

  // ---- builtin functions ----
  vm.globals.set('print', bf('print', (vm2, args) => { vm2.out(args.map(pyStr).join(' ')); return null; }));

  vm.globals.set('len', bf('len', (vm2, args, line) => {
    const v = args[0];
    if (typeof v === 'string') return v.length;
    if (Array.isArray(v)) return v.length;
    if (v instanceof PyTuple) return v.items.length;
    if (v instanceof PyDict) return v.size;
    if (v instanceof PyRange) return v.length;
    vm2.raise('TypeError', `object of type '${typeName(v)}' has no len()`, line);
  }));

  vm.globals.set('range', bf('range', (vm2, args, line) => {
    if (args.length === 1) return new PyRange(0, toNumberArg(vm2, args[0], line, 'range'), 1);
    if (args.length === 2) return new PyRange(toNumberArg(vm2, args[0], line, 'range'), toNumberArg(vm2, args[1], line, 'range'), 1);
    if (args.length === 3) {
      const step = toNumberArg(vm2, args[2], line, 'range');
      if (step === 0) vm2.raise('ValueError', 'range() arg 3 must not be zero', line);
      return new PyRange(toNumberArg(vm2, args[0], line, 'range'), toNumberArg(vm2, args[1], line, 'range'), step);
    }
    vm2.raise('TypeError', `range expected 1 to 3 arguments, got ${args.length}`, line);
  }));

  vm.globals.set('str', bf('str', (vm2, args) => (args.length === 0 ? '' : pyStr(args[0]))));
  vm.globals.set('bool', bf('bool', (vm2, args) => (args.length === 0 ? false : isTruthy(args[0]))));

  vm.globals.set('int', bf('int', (vm2, args, line) => {
    if (args.length === 0) return 0;
    const v = args[0];
    if (isNum(v)) return Math.trunc(numVal(v));
    if (typeof v === 'string') {
      const n = Number(v.trim());
      if (v.trim() === '' || Number.isNaN(n)) vm2.raise('ValueError', `invalid literal for int() with base 10: ${JSON.stringify(v)}`, line);
      return Math.trunc(n);
    }
    vm2.raise('TypeError', `int() argument must be a string or a number, not '${typeName(v)}'`, line);
  }));

  vm.globals.set('float', bf('float', (vm2, args, line) => {
    if (args.length === 0) return mkFloat(0);
    const v = args[0];
    if (isNum(v)) return mkFloat(numVal(v));
    if (typeof v === 'string') {
      const n = Number(v.trim());
      if (v.trim() === '' || Number.isNaN(n)) vm2.raise('ValueError', `could not convert string to float: ${JSON.stringify(v)}`, line);
      return mkFloat(n);
    }
    vm2.raise('TypeError', `float() argument must be a string or a number, not '${typeName(v)}'`, line);
  }));

  vm.globals.set('list', bf('list', (vm2, args, line) => (args.length === 0 ? [] : vm2.toSequenceArray(args[0], line).slice())));
  vm.globals.set('dict', bf('dict', (vm2, args) => (args.length === 0 ? new PyDict() : args[0].clone())));
  vm.globals.set('tuple', bf('tuple', (vm2, args, line) => new PyTuple(args.length === 0 ? [] : vm2.toSequenceArray(args[0], line))));

  vm.globals.set('type', bf('type', (vm2, args, line) => {
    const v = args[0];
    if (v instanceof PyInstance) return v.cls;
    vm2.raise('TypeError', `type() of builtin values is not supported in v0.1 (name: '${typeName(v)}')`, line);
  }));
  vm.globals.set('isinstance', bf('isinstance', (vm2, args, line) => {
    const [v, cls] = args;
    const classList = cls instanceof PyTuple ? cls.items : [cls];
    return classList.some((c) => {
      if (!(c instanceof PyClass)) return false;
      if (v instanceof PyInstance) return v.cls.isSubclassOf(c);
      return false;
    });
  }));

  vm.globals.set('abs', bf('abs', (vm2, args, line) => {
    const v = args[0]; const n = toNumberArg(vm2, v, line, 'abs');
    return isInt(v) ? Math.abs(n) : mkFloat(Math.abs(n));
  }));
  vm.globals.set('min', bf('min', (vm2, args, line) => reduceMinMax(vm2, args, line, -1)));
  vm.globals.set('max', bf('max', (vm2, args, line) => reduceMinMax(vm2, args, line, 1)));
  vm.globals.set('sum', bf('sum', (vm2, args, line) => {
    const seq = vm2.toSequenceArray(args[0], line);
    let total = args.length > 1 ? args[1] : 0;
    for (const v of seq) total = vm2.binaryOp('+', total, v, line);
    return total;
  }));
  vm.globals.set('sorted', bf('sorted', (vm2, args, line) => {
    const seq = vm2.toSequenceArray(args[0], line).slice();
    seq.sort((x, y) => (vm2.compareOp('<', x, y, line) ? -1 : (vm2.compareOp('>', x, y, line) ? 1 : 0)));
    return seq;
  }));

  // ---- methods on lists / dicts / strings, reached via GET_ATTR ----
  vm.methodTable = (obj, name, line) => {
    if (Array.isArray(obj)) return listMethod(vm, obj, name, line);
    if (obj instanceof PyDict) return dictMethod(vm, obj, name, line);
    if (typeof obj === 'string') return strMethod(vm, obj, name, line);
    return undefined;
  };

  return classes;
}

function reduceMinMax(vm, args, line, sign) {
  const seq = args.length === 1 ? vm.toSequenceArray(args[0], line) : args;
  if (seq.length === 0) vm.raise('ValueError', 'min()/max() arg is an empty sequence', line);
  let best = seq[0];
  for (let i = 1; i < seq.length; i++) {
    const gt = vm.compareOp('>', seq[i], best, line);
    if ((sign > 0 && gt) || (sign < 0 && !gt && !pyEquals(seq[i], best))) best = seq[i];
  }
  return best;
}

function listMethod(vm, list, name, line) {
  switch (name) {
    case 'append': return bf('append', (vm2, args) => { list.push(args[0]); return null; });
    case 'pop': return bf('pop', (vm2, args, l) => {
      if (list.length === 0) vm2.raise('IndexError', 'pop from empty list', l);
      const i = args.length ? vm2.normIndex(args[0], list.length, l) : list.length - 1;
      if (i < 0 || i >= list.length) vm2.raise('IndexError', 'pop index out of range', l);
      return list.splice(i, 1)[0];
    });
    case 'insert': return bf('insert', (vm2, args) => { let i = numVal(args[0]); if (i < 0) i = Math.max(0, list.length + i); i = Math.min(i, list.length); list.splice(i, 0, args[1]); return null; });
    case 'remove': return bf('remove', (vm2, args, l) => {
      const i = list.findIndex((x) => pyEquals(x, args[0]));
      if (i === -1) vm2.raise('ValueError', 'list.remove(x): x not in list', l);
      list.splice(i, 1); return null;
    });
    case 'index': return bf('index', (vm2, args, l) => {
      const i = list.findIndex((x) => pyEquals(x, args[0]));
      if (i === -1) vm2.raise('ValueError', `${pyStr(args[0])} is not in list`, l);
      return i;
    });
    case 'count': return bf('count', (vm2, args) => list.filter((x) => pyEquals(x, args[0])).length);
    case 'reverse': return bf('reverse', () => { list.reverse(); return null; });
    case 'sort': return bf('sort', (vm2, args, l) => { list.sort((x, y) => (vm2.compareOp('<', x, y, l) ? -1 : (vm2.compareOp('>', x, y, l) ? 1 : 0))); return null; });
    case 'clear': return bf('clear', () => { list.length = 0; return null; });
    default: return undefined;
  }
}

function dictMethod(vm, dict, name, line) {
  switch (name) {
    case 'get': return bf('get', (vm2, args) => (dict.has(args[0]) ? dict.get(args[0]) : (args.length > 1 ? args[1] : null)));
    case 'keys': return bf('keys', () => dict.keys());
    case 'values': return bf('values', () => dict.values());
    case 'items': return bf('items', () => dict.entries().map(([k, v]) => new PyTuple([k, v])));
    case 'pop': return bf('pop', (vm2, args, l) => {
      if (dict.has(args[0])) { const v = dict.get(args[0]); dict.delete(args[0]); return v; }
      if (args.length > 1) return args[1];
      vm2.raise('KeyError', pyStr(args[0]), l);
    });
    case 'update': return bf('update', (vm2, args) => { for (const [k, v] of args[0].entries()) dict.set(k, v); return null; });
    case 'setdefault': return bf('setdefault', (vm2, args) => { if (!dict.has(args[0])) dict.set(args[0], args.length > 1 ? args[1] : null); return dict.get(args[0]); });
    case 'clear': return bf('clear', () => { dict.map.clear(); return null; });
    default: return undefined;
  }
}

function strMethod(vm, s, name, line) {
  switch (name) {
    case 'upper': return bf('upper', () => s.toUpperCase());
    case 'lower': return bf('lower', () => s.toLowerCase());
    case 'strip': return bf('strip', () => s.trim());
    case 'lstrip': return bf('lstrip', () => s.replace(/^\s+/, ''));
    case 'rstrip': return bf('rstrip', () => s.replace(/\s+$/, ''));
    case 'split': return bf('split', (vm2, args) => (args.length ? s.split(args[0]) : s.split(/\s+/).filter((x) => x.length)));
    case 'join': return bf('join', (vm2, args, l) => vm2.toSequenceArray(args[0], l).map(pyStr).join(s));
    case 'replace': return bf('replace', (vm2, args) => s.split(args[0]).join(args[1]));
    case 'startswith': return bf('startswith', (vm2, args) => s.startsWith(args[0]));
    case 'endswith': return bf('endswith', (vm2, args) => s.endsWith(args[0]));
    case 'find': return bf('find', (vm2, args) => s.indexOf(args[0]));
    case 'format': return bf('format', (vm2, args) => { let i = 0; return s.replace(/\{\}/g, () => pyStr(args[i++])); });
    default: return undefined;
  }
}

export { installBuiltins, bf };
