// Runtime values shared by both languages.
//
// One representation per kind, whichever language made the value:
//
//   kind        JS representation   Crumb            MiniPy
//   ---------   -----------------   --------------   -------------------
//   Nothing     null                Nothing          None
//   Boolean     true / false        Boolean          bool
//   String      JS string           String           str
//   Number      JS number (double)  Number           float
//   Int         JS bigint           (never made)     int (arbitrary size)
//   Array       CrumbArray          Array (fixed)    (never made)
//   list        JS Array            (never made)     list
//   ...and the MiniPy-only kinds below (tuple, dict, range, function, class,
//   instance, bound method, built-in function).
//
// Crumb's one numeric type and MiniPy's float are both IEEE 754 doubles, so
// they are the same kind. MiniPy's int is the extra kind: a bigint, so ints
// never lose precision. Only MiniPy opcodes produce an Int; Crumb opcodes
// never see one.
//
// A slot that has never been assigned holds UNBOUND. Crumb chunks start every
// slot at Nothing, so Crumb code never reads UNBOUND; MiniPy chunks start
// them UNBOUND, so reading one is a NameError.

/** Crumb's Nothing and MiniPy's None: one value. */
export const NOTHING = null;

/** The contents of a slot that has never been assigned. */
export const UNBOUND = undefined;

// ------------------------------------------------------------------- Crumb --

export class CrumbArray {
  constructor(bound) {
    this.bound = bound;                                  // highest valid index
    this.elements = new Array(bound + 1).fill(NOTHING);
  }
}

// ------------------------------------------------------------------ MiniPy --

export class PyTuple {
  constructor(items) { this.items = items; }
}

export class PyDict {
  constructor() { this.map = new Map(); }

  /** A hashable key -> its Map key; null for an unhashable value. Numbers
   *  that compare equal (1, 1.0, True) share a key, as in Python. */
  static keyOf(k) {
    if (k === null) return 'N';
    if (typeof k === 'boolean') return k ? 'n1' : 'n0';
    if (typeof k === 'bigint') return `n${k}`;
    if (typeof k === 'number') {
      if (Number.isInteger(k) && Number.isFinite(k)) return `n${BigInt(k)}`;
      return `n${k}`;
    }
    if (typeof k === 'string') return `s${k}`;
    if (k instanceof PyTuple) {
      const parts = k.items.map(PyDict.keyOf);
      return parts.includes(null) ? null : `t(${parts.join(',')})`;
    }
    return null;
  }

  get(k) { const e = this.map.get(PyDict.keyOf(k)); return e ? e.value : undefined; }
  set(k, v) {
    const key = PyDict.keyOf(k);
    const existing = this.map.get(key);
    if (existing) existing.value = v;        // keeps the first key, as Python does
    else this.map.set(key, { key: k, value: v });
  }
  has(k) { return this.map.has(PyDict.keyOf(k)); }
  delete(k) { return this.map.delete(PyDict.keyOf(k)); }
  keys() { return [...this.map.values()].map((e) => e.key); }
  values() { return [...this.map.values()].map((e) => e.value); }
  entries() { return [...this.map.values()].map((e) => [e.key, e.value]); }
  get size() { return this.map.size; }
  clone() {
    const d = new PyDict();
    for (const [k, v] of this.map) d.map.set(k, { key: v.key, value: v.value });
    return d;
  }
}

/** range(start, stop, step). Bounds are held as JS numbers; items are ints. */
export class PyRange {
  constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; }
  get length() { return Math.max(0, Math.ceil((this.stop - this.start) / this.step)); }
  at(i) { return BigInt(this.start + i * this.step); }
  toArray() { const out = []; for (let i = 0; i < this.length; i += 1) out.push(this.at(i)); return out; }
}

/** A user function: a procedure of the chunk plus its default values. */
export class PyFunction {
  constructor(name, proc, procIndex, defaults) {
    this.name = name;
    this.proc = proc;             // chunk.procedures[procIndex]
    this.procIndex = procIndex;
    this.defaults = defaults;     // right-aligned to the parameters
  }
}

export class PyClass {
  constructor(name, base) {
    this.name = name;
    this.base = base || null;
    this.methods = new Map();
  }
  /** The attribute from this class or the nearest base; undefined if none.
   *  (A class attribute may legitimately be None, so null means found.) */
  findMethod(name) {
    for (let c = this; c; c = c.base) if (c.methods.has(name)) return c.methods.get(name);
    return undefined;
  }
  isSubclassOf(other) {
    for (let c = this; c; c = c.base) if (c === other) return true;
    return false;
  }
}

export class PyInstance {
  constructor(cls) { this.cls = cls; this.attrs = new Map(); }
}

export class PyBoundMethod {
  constructor(instance, func) { this.instance = instance; this.func = func; }
}

/** A built-in function: fn(vm, args) -> value. */
export class PyBuiltinFunction {
  constructor(name, fn) { this.name = name; this.fn = fn; }
}
