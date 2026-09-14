// The 15 built-ins of spec section 10. Fixed arity, checked at compile time;
// argument types checked here, at the call.
//
// String positions are 1-based throughout, following VB.

import {
  NOTHING, CrumbArray, typeName, toStr, formatNumber,
  isNumber, isString, isArray,
} from './values.js';

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
];

/** lowercase name -> { index, name, arity, fn } */
export const BUILTINS = new Map(
  BUILTIN_LIST.map((builtin, index) => [builtin.name.toLowerCase(), { index, ...builtin }]),
);

export { NOTHING, CrumbArray };
