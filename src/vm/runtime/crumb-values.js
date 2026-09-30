// Crumb's view of the shared runtime values (src/vm/values.js) and the
// conversions of spec sections 3 and 10.
//
//   Number  -> JS number (double)
//   String  -> JS string
//   Boolean -> JS boolean
//   Nothing -> NOTHING (null), the same value as MiniPy's None
//   Array   -> CrumbArray
//   object  -> Widget (a Label or a Button; its type name is its class)

import { NOTHING, CrumbArray, Widget } from '../values.js';

export { NOTHING, CrumbArray, Widget };

export function typeName(value) {
  if (value === NOTHING) return 'Nothing';
  if (value instanceof CrumbArray) return 'Array';
  if (value instanceof Widget) return value.cls.name;
  switch (typeof value) {
    case 'number': return 'Number';
    case 'string': return 'String';
    case 'boolean': return 'Boolean';
    default: return 'Unknown';
  }
}

export const isNumber = (v) => typeof v === 'number';
export const isString = (v) => typeof v === 'string';
export const isBoolean = (v) => typeof v === 'boolean';
export const isArray = (v) => v instanceof CrumbArray;
export const isObject = (v) => v instanceof Widget;

/**
 * Number -> String. Integral values get no decimal point (section 10), and
 * -0 prints as 0.
 */
export function formatNumber(n) {
  if (Number.isInteger(n)) return String(n === 0 ? 0 : n);
  return String(n);
}

/** The `Str` conversion, also used by `&` and `Print` (sections 6, 8, 10). */
export function toStr(value) {
  if (value === NOTHING) return '';
  if (isNumber(value)) return formatNumber(value);
  if (isString(value)) return value;
  if (isBoolean(value)) return value ? 'True' : 'False';
  if (isArray(value)) return `<array 0..${value.bound}>`;
  if (isObject(value)) return `<${value.cls.name}>`;
  return String(value);
}

/** True when an index is usable as an array subscript. */
export function isIndexable(n) {
  return isNumber(n) && Number.isInteger(n);
}
