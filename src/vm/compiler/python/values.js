// MiniPy runtime values and the operations over them.

// Runtime values.
//   int    -> plain JS number (always integral by construction)
//   float  -> PyFloat wrapper (so 4 vs 4.0 stay distinguishable)
//   bool   -> JS true/false
//   None   -> JS null
//   str    -> JS string
//   list   -> JS Array (mutable)
//   tuple  -> PyTuple (immutable)
//   dict   -> PyDict
//   function/class/instance/bound method/builtin -> classes below

class PyFloat {
  constructor(value) { this.value = value; }
}
const mkFloat = (v) => new PyFloat(v);
const isNum = (v) => typeof v === 'number' || v instanceof PyFloat || typeof v === 'boolean';
const isInt = (v) => typeof v === 'number' || typeof v === 'boolean';
const numVal = (v) => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof PyFloat) return v.value;
  return v;
};

class PyTuple {
  constructor(items) { this.items = items; }
}

class PyDict {
  constructor() { this.map = new Map(); }
  static keyOf(k) {
    if (k === null) return 'N';
    if (typeof k === 'boolean') return 'n' + (k ? 1 : 0);
    if (typeof k === 'number') return 'n' + k;
    if (k instanceof PyFloat) return 'n' + k.value;
    if (typeof k === 'string') return 's' + k;
    return null; // unhashable
  }
  get(k) { const e = this.map.get(PyDict.keyOf(k)); return e ? e.value : undefined; }
  set(k, v) { this.map.set(PyDict.keyOf(k), { key: k, value: v }); }
  has(k) { return this.map.has(PyDict.keyOf(k)); }
  delete(k) { return this.map.delete(PyDict.keyOf(k)); }
  keys() { return [...this.map.values()].map((e) => e.key); }
  values() { return [...this.map.values()].map((e) => e.value); }
  entries() { return [...this.map.values()].map((e) => [e.key, e.value]); }
  get size() { return this.map.size; }
  clone() { const d = new PyDict(); for (const [k, v] of this.map) d.map.set(k, { key: v.key, value: v.value }); return d; }
}

class PyRange {
  constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; }
  get length() {
    if (this.step > 0) return Math.max(0, Math.ceil((this.stop - this.start) / this.step));
    return Math.max(0, Math.ceil((this.stop - this.start) / this.step));
  }
  at(i) { return this.start + i * this.step; }
  toArray() { const out = []; for (let i = 0; i < this.length; i++) out.push(this.at(i)); return out; }
}

class PyFunction {
  constructor(name, proc, defaults) {
    this.name = name;
    this.proc = proc;       // { entry, arity, paramNames, slotCount }
    this.defaults = defaults; // array of default values, right-aligned to params
  }
}
class PyClass {
  constructor(name, base) {
    this.name = name;
    this.base = base || null;
    this.methods = new Map();
  }
  findMethod(name) {
    let c = this;
    while (c) { if (c.methods.has(name)) return c.methods.get(name); c = c.base; }
    return null;
  }
  isSubclassOf(other) {
    let c = this;
    while (c) { if (c === other) return true; c = c.base; }
    return false;
  }
}
class PyInstance {
  constructor(cls) { this.cls = cls; this.attrs = new Map(); }
}
class PyBoundMethod {
  constructor(instance, func) { this.instance = instance; this.func = func; }
}
class PyBuiltinFunction {
  constructor(name, fn) { this.name = name; this.fn = fn; } // fn(vm, args) -> value
}

function typeName(v) {
  if (v === null) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'int';
  if (v instanceof PyFloat) return 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return 'list';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PyFunction || v instanceof PyBuiltinFunction || v instanceof PyBoundMethod) return 'function';
  if (v instanceof PyClass) return 'type';
  if (v instanceof PyInstance) return v.cls.name;
  if (v instanceof PyRange) return 'range';
  return 'object';
}

function isTruthy(v) {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof PyFloat) return v.value !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict) return v.size > 0;
  return true;
}

function numToStr(n) {
  if (!isFinite(n)) return n > 0 ? 'inf' : (n < 0 ? '-inf' : 'nan');
  return String(n);
}

function pyStr(v) {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return numToStr(v);
  if (v instanceof PyFloat) {
    const n = v.value;
    if (!isFinite(n)) return numToStr(n);
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  }
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return '[' + v.map(pyRepr).join(', ') + ']';
  if (v instanceof PyTuple) {
    if (v.items.length === 1) return '(' + pyRepr(v.items[0]) + ',)';
    return '(' + v.items.map(pyRepr).join(', ') + ')';
  }
  if (v instanceof PyDict) return '{' + v.entries().map(([k, val]) => `${pyRepr(k)}: ${pyRepr(val)}`).join(', ') + '}';
  if (v instanceof PyRange) return v.step === 1 ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  if (v instanceof PyFunction) return `<function ${v.name}>`;
  if (v instanceof PyBuiltinFunction) return `<builtin function ${v.name}>`;
  if (v instanceof PyBoundMethod) return `<bound method ${v.func.name}>`;
  if (v instanceof PyClass) return `<class '${v.name}'>`;
  if (v instanceof PyInstance) {
    if (v.attrs.has('__msg__')) return pyStr(v.attrs.get('__msg__'));
    return `<${v.cls.name} object>`;
  }
  return String(v);
}
function pyRepr(v) {
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  return pyStr(v);
}

function pyEquals(a, b) {
  if (isNum(a) && isNum(b)) return numVal(a) === numVal(b);
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => pyEquals(x, b[i]));
  if (a instanceof PyTuple && b instanceof PyTuple) return a.items.length === b.items.length && a.items.every((x, i) => pyEquals(x, b.items[i]));
  if (a instanceof PyDict && b instanceof PyDict) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a.entries()) { if (!b.has(k) || !pyEquals(b.get(k), v)) return false; }
    return true;
  }
  return a === b;
}

function pyIs(a, b) {
  if (a === null || b === null) return a === b;
  if (isNum(a) && isNum(b) && !(a instanceof PyFloat) && !(b instanceof PyFloat)) return numVal(a) === numVal(b);
  return a === b;
}

export {
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
};
