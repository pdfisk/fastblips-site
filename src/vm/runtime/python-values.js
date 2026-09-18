// MiniPy's view of the shared runtime values (src/vm/values.js): type names,
// truthiness, str()/repr(), equality and the int/float numeric tower.
//
//   int    -> bigint            (the Int kind: arbitrary precision)
//   float  -> JS number         (the same kind as Crumb's Number)
//   bool   -> JS boolean        (an int subtype in arithmetic: True + 1 == 2)
//   None   -> NOTHING (null)    (the same value as Crumb's Nothing)
//   str    -> JS string
//   list   -> JS Array
//   tuple, dict, range, function, class, instance, bound method, builtin
//          -> the classes in src/vm/values.js

import {
  NOTHING, PyTuple, PyDict, PyRange, PyFunction, PyClass, PyInstance,
  PyBoundMethod, PyBuiltinFunction,
} from '../values.js';

export {
  NOTHING, PyTuple, PyDict, PyRange, PyFunction, PyClass, PyInstance,
  PyBoundMethod, PyBuiltinFunction,
};

// ---------------------------------------------------------------- numbers --

/** int or bool */
export const isInt = (v) => typeof v === 'bigint' || typeof v === 'boolean';
/** float */
export const isFloat = (v) => typeof v === 'number';
/** int, bool or float */
export const isNum = (v) => typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean';

/** int or bool -> bigint */
export function toBig(v) {
  if (typeof v === 'boolean') return v ? 1n : 0n;
  return v;
}

/** any number -> JS number (may lose precision for a huge int) */
export function toFloat(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return Number(v);
}

/** An int small enough to use as a JS index or count. */
export function toIndex(v) {
  return Number(toBig(v));
}

// ------------------------------------------------------------------ types --

export function typeName(v) {
  if (v === NOTHING) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'bigint') return 'int';
  if (typeof v === 'number') return 'float';
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

export function isTruthy(v) {
  if (v === NOTHING) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return v !== 0n;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict) return v.size > 0;
  if (v instanceof PyRange) return v.length > 0;
  return true;
}

// -------------------------------------------------------------- str/repr --

/** float -> str, the way Python's repr() writes it. */
export function formatFloat(n) {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0';
  const abs = Math.abs(n);
  if (abs >= 1e16 || abs < 1e-4) {
    // Python switches to exponent form at 1e16 and below 1e-4, and always
    // writes at least two exponent digits.
    const [mantissa, exponent] = n.toExponential().split('e');
    const sign = exponent[0] === '-' ? '-' : '+';
    const digits = exponent.replace(/^[+-]/, '').padStart(2, '0');
    return `${mantissa}e${sign}${digits}`;
  }
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function pyStr(v) {
  if (v === NOTHING) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return formatFloat(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (v instanceof PyTuple) {
    if (v.items.length === 1) return `(${pyRepr(v.items[0])},)`;
    return `(${v.items.map(pyRepr).join(', ')})`;
  }
  if (v instanceof PyDict) return `{${v.entries().map(([k, val]) => `${pyRepr(k)}: ${pyRepr(val)}`).join(', ')}}`;
  if (v instanceof PyRange) {
    return v.step === 1 ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  }
  if (v instanceof PyFunction) return `<function ${v.name}>`;
  if (v instanceof PyBuiltinFunction) return `<built-in function ${v.name}>`;
  if (v instanceof PyBoundMethod) return `<bound method ${v.func.name}>`;
  if (v instanceof PyClass) return `<class '${v.name}'>`;
  if (v instanceof PyInstance) {
    if (v.attrs.has('__msg__')) return pyStr(v.attrs.get('__msg__'));
    return `<${v.cls.name} object>`;
  }
  return String(v);
}

export function pyRepr(v) {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return pyStr(v);
}

// ------------------------------------------------------------- equality --

export function numEquals(a, b) {
  const x = typeof a === 'boolean' ? toBig(a) : a;
  const y = typeof b === 'boolean' ? toBig(b) : b;
  // A bigint and a number compare exactly under loose equality.
  // eslint-disable-next-line eqeqeq
  return x == y;
}

export function pyEquals(a, b) {
  if (isNum(a) && isNum(b)) return numEquals(a, b);
  if (a === NOTHING || b === NOTHING) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => pyEquals(x, b[i]));
  }
  if (a instanceof PyTuple && b instanceof PyTuple) {
    return a.items.length === b.items.length && a.items.every((x, i) => pyEquals(x, b.items[i]));
  }
  if (a instanceof PyDict && b instanceof PyDict) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a.entries()) if (!b.has(k) || !pyEquals(b.get(k), v)) return false;
    return true;
  }
  return a === b;
}

export function pyIs(a, b) {
  if (a === NOTHING || b === NOTHING) return a === b;
  // Small-int identity: two equal ints are the same object here.
  if (typeof a === 'bigint' && typeof b === 'bigint') return a === b;
  return a === b;
}
