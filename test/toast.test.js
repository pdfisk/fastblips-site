import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  toastSide, setToastSide, toastDuration, setToastDuration, durationLabel,
  TOAST_SIDES, TOAST_DURATIONS, DEFAULT_TOAST_SIDE, DEFAULT_TOAST_DURATION,
} from '../src/ui/toast.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

// The module remembers the last choice made on the page; reset it to the saved default.
beforeEach(() => { store.clear(); });

test('the defaults are the top and 3 seconds', () => {
  store.clear();
  assert.equal(DEFAULT_TOAST_SIDE, 'top');
  assert.equal(DEFAULT_TOAST_DURATION, 3000);
  assert.ok(TOAST_DURATIONS.includes(DEFAULT_TOAST_DURATION));
  assert.ok(TOAST_SIDES.some(([name]) => name === DEFAULT_TOAST_SIDE));
});

test('setToastSide changes the side and remembers it', () => {
  setToastSide('left');
  assert.equal(toastSide(), 'left');
  assert.equal(store.get('crumb.toastSide'), 'left');
  assert.throws(() => setToastSide('middle'), /unknown toast side/);
  assert.equal(toastSide(), 'left');
  setToastSide('top');
});

test('setToastDuration changes the time and remembers it', () => {
  setToastDuration(5000);
  assert.equal(toastDuration(), 5000);
  assert.equal(store.get('crumb.toastDuration'), '5000');
  assert.throws(() => setToastDuration(0), /above 0/);
  assert.throws(() => setToastDuration('soon'), /above 0/);
  assert.equal(toastDuration(), 5000);
  setToastDuration(3000);
});

test('durationLabel reads in seconds', () => {
  assert.equal(durationLabel(1000), '1 second');
  assert.equal(durationLabel(3000), '3 seconds');
});
