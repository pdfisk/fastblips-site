// The work behind MiniPy's opcodes: operators, subscripts, slices,
// attributes and iteration. Each function takes the VM first and reports an
// error with vm.raise(className, message), which raises a catchable MiniPy
// exception at the current instruction.

import {
  NOTHING, PyTuple, PyDict, PyRange, PyFunction, PyClass, PyInstance, PyBoundMethod,
  isInt, isNum, toBig, toFloat, toIndex, typeName, isTruthy, pyStr, pyEquals, pyIs,
} from './python-values.js';

// -------------------------------------------------------------- arithmetic --

const MAX_POW_BITS = 1_000_000;

function unsupported(vm, sym, a, b) {
  vm.raise('TypeError', `unsupported operand type(s) for ${sym}: '${typeName(a)}' and '${typeName(b)}'`);
}

function repeat(vm, seq, count) {
  const n = Math.max(0, toIndex(count));
  if (typeof seq === 'string') return seq.repeat(n);
  const items = Array.isArray(seq) ? seq : seq.items;
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(...items);
  return Array.isArray(seq) ? out : new PyTuple(out);
}

const isSeq = (v) => typeof v === 'string' || Array.isArray(v) || v instanceof PyTuple;

export function add(vm, a, b) {
  if (isInt(a) && isInt(b)) return toBig(a) + toBig(b);
  if (isNum(a) && isNum(b)) return toFloat(a) + toFloat(b);
  if (typeof a === 'string' && typeof b === 'string') return a + b;
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
  return unsupported(vm, '+', a, b);
}

export function sub(vm, a, b) {
  if (isInt(a) && isInt(b)) return toBig(a) - toBig(b);
  if (isNum(a) && isNum(b)) return toFloat(a) - toFloat(b);
  return unsupported(vm, '-', a, b);
}

export function mul(vm, a, b) {
  if (isInt(a) && isInt(b)) return toBig(a) * toBig(b);
  if (isNum(a) && isNum(b)) return toFloat(a) * toFloat(b);
  if (isSeq(a) && isInt(b)) return repeat(vm, a, b);
  if (isSeq(b) && isInt(a)) return repeat(vm, b, a);
  return unsupported(vm, '*', a, b);
}

export function truediv(vm, a, b) {
  if (!isNum(a) || !isNum(b)) return unsupported(vm, '/', a, b);
  const y = toFloat(b);
  if (y === 0) vm.raise('ZeroDivisionError', 'division by zero');
  return toFloat(a) / y;
}

export function floordiv(vm, a, b) {
  if (isInt(a) && isInt(b)) {
    const x = toBig(a);
    const y = toBig(b);
    if (y === 0n) vm.raise('ZeroDivisionError', 'integer division or modulo by zero');
    let q = x / y;                                   // truncates toward zero
    if (x % y !== 0n && (x < 0n) !== (y < 0n)) q -= 1n;
    return q;
  }
  if (isNum(a) && isNum(b)) {
    const y = toFloat(b);
    if (y === 0) vm.raise('ZeroDivisionError', 'float floor division by zero');
    return Math.floor(toFloat(a) / y);
  }
  return unsupported(vm, '//', a, b);
}

export function mod(vm, a, b) {
  if (isInt(a) && isInt(b)) {
    const x = toBig(a);
    const y = toBig(b);
    if (y === 0n) vm.raise('ZeroDivisionError', 'integer modulo by zero');
    let r = x % y;                                   // sign of x
    if (r !== 0n && (r < 0n) !== (y < 0n)) r += y;   // -> sign of y
    return r;
  }
  if (isNum(a) && isNum(b)) {
    const x = toFloat(a);
    const y = toFloat(b);
    if (y === 0) vm.raise('ZeroDivisionError', 'float modulo');
    return x - Math.floor(x / y) * y;
  }
  return unsupported(vm, '%', a, b);
}

export function pow(vm, a, b) {
  if (isInt(a) && isInt(b)) {
    const x = toBig(a);
    const y = toBig(b);
    if (y < 0n) {
      if (x === 0n) vm.raise('ZeroDivisionError', '0.0 cannot be raised to a negative power');
      return toFloat(x) ** toFloat(y);
    }
    const magnitude = x < 0n ? -x : x;
    if (magnitude > 1n && Number(y) * magnitude.toString(2).length > MAX_POW_BITS) {
      vm.raise('ValueError', 'exponent too large');
    }
    return x ** y;
  }
  if (isNum(a) && isNum(b)) return toFloat(a) ** toFloat(b);
  return unsupported(vm, '**', a, b);
}

export function neg(vm, v) {
  if (isInt(v)) return -toBig(v);
  if (typeof v === 'number') return -v;
  return vm.raise('TypeError', `bad operand type for unary -: '${typeName(v)}'`);
}

export function pos(vm, v) {
  if (isInt(v)) return toBig(v);
  if (typeof v === 'number') return v;
  return vm.raise('TypeError', `bad operand type for unary +: '${typeName(v)}'`);
}

// -------------------------------------------------------------- comparing --

/** <, <=, >, >= : numbers with numbers, strings with strings, and sequences
 *  of the same kind element by element. */
export function order(vm, sym, l, r) {
  const c = compareValues(vm, sym, l, r);
  switch (sym) {
    case '<': return c < 0;
    case '<=': return c <= 0;
    case '>': return c > 0;
    default: return c >= 0;
  }
}

function compareValues(vm, sym, l, r) {
  if (isNum(l) && isNum(r)) {
    const x = typeof l === 'boolean' ? toBig(l) : l;
    const y = typeof r === 'boolean' ? toBig(r) : r;
    if (x < y) return -1;
    if (x > y) return 1;
    return x == y ? 0 : NaN;      // eslint-disable-line eqeqeq
  }
  if (typeof l === 'string' && typeof r === 'string') return l < r ? -1 : (l > r ? 1 : 0);
  const bothLists = Array.isArray(l) && Array.isArray(r);
  const bothTuples = l instanceof PyTuple && r instanceof PyTuple;
  if (bothLists || bothTuples) {
    const a = bothLists ? l : l.items;
    const b = bothLists ? r : r.items;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      if (!pyEquals(a[i], b[i])) return compareValues(vm, sym, a[i], b[i]);
    }
    return a.length - b.length;
  }
  return vm.raise('TypeError', `'${sym}' not supported between instances of '${typeName(l)}' and '${typeName(r)}'`);
}

export function contains(vm, item, container) {
  if (typeof container === 'string') {
    if (typeof item !== 'string') vm.raise('TypeError', "'in <string>' requires string as left operand");
    return container.includes(item);
  }
  if (Array.isArray(container)) return container.some((x) => pyEquals(x, item));
  if (container instanceof PyTuple) return container.items.some((x) => pyEquals(x, item));
  if (container instanceof PyDict) return container.has(item);
  if (container instanceof PyRange) {
    if (!isInt(item)) return false;
    const v = toIndex(item);
    const { start, stop, step } = container;
    const inBounds = step > 0 ? v >= start && v < stop : v <= start && v > stop;
    return inBounds && (v - start) % step === 0;
  }
  return vm.raise('TypeError', `argument of type '${typeName(container)}' is not iterable`);
}

export { pyEquals, pyIs, isTruthy, pyStr };

// ------------------------------------------------------------- subscripts --

export function normIndex(vm, i, len) {
  if (!isInt(i)) vm.raise('TypeError', `indices must be integers, not ${typeName(i)}`);
  let v = toIndex(i);
  if (v < 0) v += len;
  return v;
}

export function getItem(vm, obj, idx) {
  if (Array.isArray(obj) || obj instanceof PyTuple || typeof obj === 'string') {
    const len = obj instanceof PyTuple ? obj.items.length : obj.length;
    const i = normIndex(vm, idx, len);
    if (i < 0 || i >= len) vm.raise('IndexError', `${typeName(obj)} index out of range`);
    return obj instanceof PyTuple ? obj.items[i] : obj[i];
  }
  if (obj instanceof PyDict) {
    if (PyDict.keyOf(idx) === null) vm.raise('TypeError', `unhashable type: '${typeName(idx)}'`);
    if (!obj.has(idx)) vm.raise('KeyError', pyStr(idx));
    return obj.get(idx);
  }
  if (obj instanceof PyRange) {
    const i = normIndex(vm, idx, obj.length);
    if (i < 0 || i >= obj.length) vm.raise('IndexError', 'range object index out of range');
    return obj.at(i);
  }
  return vm.raise('TypeError', `'${typeName(obj)}' object is not subscriptable`);
}

export function setItem(vm, obj, idx, val) {
  if (Array.isArray(obj)) {
    const i = normIndex(vm, idx, obj.length);
    if (i < 0 || i >= obj.length) vm.raise('IndexError', 'list assignment index out of range');
    obj[i] = val;
    return;
  }
  if (obj instanceof PyDict) {
    if (PyDict.keyOf(idx) === null) vm.raise('TypeError', `unhashable type: '${typeName(idx)}'`);
    obj.set(idx, val);
    return;
  }
  vm.raise('TypeError', `'${typeName(obj)}' object does not support item assignment`);
}

export function delItem(vm, obj, idx) {
  if (Array.isArray(obj)) {
    const i = normIndex(vm, idx, obj.length);
    if (i < 0 || i >= obj.length) vm.raise('IndexError', 'list assignment index out of range');
    obj.splice(i, 1);
    return;
  }
  if (obj instanceof PyDict) {
    if (!obj.has(idx)) vm.raise('KeyError', pyStr(idx));
    obj.delete(idx);
    return;
  }
  vm.raise('TypeError', `'${typeName(obj)}' object doesn't support item deletion`);
}

export function getSlice(vm, obj, start, stop, step) {
  const isStr = typeof obj === 'string';
  const isTuple = obj instanceof PyTuple;
  if (!Array.isArray(obj) && !isStr && !isTuple) {
    vm.raise('TypeError', `'${typeName(obj)}' object is not subscriptable`);
  }
  for (const bound of [start, stop, step]) {
    if (bound !== NOTHING && !isInt(bound)) {
      vm.raise('TypeError', 'slice indices must be integers or None');
    }
  }
  const arr = isStr ? [...obj] : (isTuple ? obj.items : obj);
  const st = step === NOTHING ? 1 : toIndex(step);
  if (st === 0) vm.raise('ValueError', 'slice step cannot be zero');
  const len = arr.length;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const at = (v) => { const n = toIndex(v); return n < 0 ? n + len : n; };
  let lo;
  let hi;
  if (st > 0) {
    lo = start === NOTHING ? 0 : clamp(at(start), 0, len);
    hi = stop === NOTHING ? len : clamp(at(stop), 0, len);
  } else {
    lo = start === NOTHING ? len - 1 : clamp(at(start), -1, len - 1);
    hi = stop === NOTHING ? -1 : clamp(at(stop), -1, len - 1);
  }
  const out = [];
  if (st > 0) for (let i = lo; i < hi; i += st) out.push(arr[i]);
  else for (let i = lo; i > hi; i += st) out.push(arr[i]);
  if (isStr) return out.join('');
  if (isTuple) return new PyTuple(out);
  return out;
}

// ------------------------------------------------------------- attributes --

export function getAttr(vm, obj, name) {
  if (obj instanceof PyInstance) {
    if (obj.attrs.has(name)) return obj.attrs.get(name);
    const m = obj.cls.findMethod(name);
    if (m !== undefined) return m instanceof PyFunction ? new PyBoundMethod(obj, m) : m;
    return vm.raise('AttributeError', `'${obj.cls.name}' object has no attribute '${name}'`);
  }
  if (obj instanceof PyClass) {
    const m = obj.findMethod(name);
    if (m !== undefined) return m;
    return vm.raise('AttributeError', `type object '${obj.name}' has no attribute '${name}'`);
  }
  const method = vm.python.method(obj, name);
  if (method) return method;
  return vm.raise('AttributeError', `'${typeName(obj)}' object has no attribute '${name}'`);
}

export function setAttr(vm, obj, name, val) {
  if (obj instanceof PyInstance) { obj.attrs.set(name, val); return; }
  vm.raise('AttributeError', `'${typeName(obj)}' object attributes are read-only`);
}

// -------------------------------------------------------------- iteration --

export function toSequenceArray(vm, v) {
  if (Array.isArray(v)) return v;
  if (v instanceof PyTuple) return v.items;
  if (typeof v === 'string') return [...v];
  if (v instanceof PyRange) return v.toArray();
  if (v instanceof PyDict) return v.keys();
  return vm.raise('TypeError', `'${typeName(v)}' object is not iterable`);
}

/** An iterator lives on the value stack while a `for` loop runs, so it is a
 *  plain object: all loop state stays inside the VM's own state. */
export function makeIterator(vm, obj) {
  if (obj instanceof PyRange) {
    let i = 0;
    const n = obj.length;
    return { next: () => (i < n ? { value: obj.at(i++) } : { done: true }) };
  }
  if (obj instanceof PyDict) {
    const keys = obj.keys();
    let i = 0;
    return { next: () => (i < keys.length ? { value: keys[i++] } : { done: true }) };
  }
  if (Array.isArray(obj) || obj instanceof PyTuple || typeof obj === 'string') {
    // Lists are read live, so appending during a loop is seen, as in Python.
    const items = obj instanceof PyTuple ? obj.items : obj;
    let i = 0;
    return { next: () => (i < items.length ? { value: items[i++] } : { done: true }) };
  }
  return vm.raise('TypeError', `'${typeName(obj)}' object is not iterable`);
}
