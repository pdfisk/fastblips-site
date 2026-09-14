// Runtime value representation and the conversions of spec sections 3 and 10.
//
//   Number  -> JS number (double)
//   String  -> JS string
//   Boolean -> JS boolean
//   Nothing -> the NOTHING sentinel
//   Array   -> CrumbArray

/** The single Nothing value (section 3). */
export const NOTHING = Symbol('Crumb.Nothing');

export class CrumbArray {
  constructor(bound) {
    this.bound = bound;                                  // highest valid index
    this.elements = new Array(bound + 1).fill(NOTHING);
  }
}

export function typeName(value) {
  if (value === NOTHING) return 'Nothing';
  if (value instanceof CrumbArray) return 'Array';
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
  return String(value);
}

/** True when an index is usable as an array subscript. */
export function isIndexable(n) {
  return isNumber(n) && Number.isInteger(n);
}
