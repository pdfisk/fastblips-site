// CanvasPanel (src/ui/widgets/canvas-panel.js) and the console's host for it
// (src/ui/board-host.js), run against a small stand-in for the DOM: elements
// with just what the widget uses, and a 2D context that records its calls.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/** A 2D context that records method calls as [name, ...args] in calls. */
function fakeContext() {
  const calls = [];
  const state = {};
  return new Proxy(state, {
    get(target, name) {
      if (name === 'calls') return calls;
      if (name in target) return target[name];
      return (...args) => { calls.push([name, ...args]); };
    },
  });
}

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.children = [];
    this.classList = { add() {} };
    this.box = { left: 0, top: 0, width: 0, height: 0 };
  }
  appendChild(child) { this.children.push(child); return child; }
  getContext() { this.context ??= fakeContext(); return this.context; }
  getBoundingClientRect() { return this.box; }
  focus() { this.focused = true; }
}

let CanvasPanel;
let keyName;
let ConsoleOutputHost;

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  globalThis.CustomEvent ??= class extends Event {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail ?? null; }
  };
  ({ CanvasPanel, keyName } = await import('../src/ui/widgets/canvas-panel.js'));
  ({ ConsoleOutputHost } = await import('../src/ui/board-host.js'));
});

const event = (type, props) => Object.assign(new Event(type), props);
const names = (ctx) => ctx.calls.map((c) => c[0]);

test('a canvas is 400 by 300 units, drawn at twice that many pixels', () => {
  const canvas = new CanvasPanel();
  assert.deepEqual([canvas.width, canvas.height], [400, 300]);
  assert.deepEqual([canvas.canvas.width, canvas.canvas.height], [800, 600]);
  canvas.setSize(100, 50);
  assert.deepEqual([canvas.width, canvas.height, canvas.canvas.width, canvas.canvas.height], [100, 50, 200, 100]);
  assert.throws(() => canvas.setSize(0, 10), RangeError);
  assert.throws(() => canvas.setSize(10, 5000), RangeError);
  assert.throws(() => canvas.add({}), /cannot contain/);
});

test('2D shapes are painted in the current colour and line width', () => {
  const canvas = new CanvasPanel();
  const ctx = canvas._ctx;
  ctx.calls.length = 0;
  canvas.color = 'red';
  canvas.lineWidth = 3;
  canvas.line(1, 2, 30, 40);
  assert.deepEqual(ctx.calls, [['beginPath'], ['moveTo', 1, 2], ['lineTo', 30, 40], ['stroke']]);
  assert.deepEqual([ctx.strokeStyle, ctx.lineWidth], ['red', 3]);
  ctx.calls.length = 0;
  canvas.fillRect(5, 6, 7, 8);
  canvas.fillCircle(50, 60, 10);
  canvas.fillTriangle(0, 0, 10, 0, 5, 8);
  canvas.fontSize = 20;
  canvas.text(3, 4, 99);
  assert.deepEqual(ctx.calls, [
    ['beginPath'], ['rect', 5, 6, 7, 8], ['fill'],
    ['beginPath'], ['arc', 50, 60, 10, 0, 2 * Math.PI], ['fill'],
    ['beginPath'], ['moveTo', 0, 0], ['lineTo', 10, 0], ['lineTo', 5, 8], ['closePath'], ['fill'],
    ['fillText', '99', 3, 4],
  ]);
  assert.equal(ctx.fillStyle, 'red');
  assert.match(ctx.font, /^20px /);
});

test('clear() fills with the background and forgets the 3D shapes', () => {
  const canvas = new CanvasPanel();
  canvas.fillBox3d(0, 0, 0, 1, 1, 1);
  assert.equal(canvas._shapes.length, 6);
  canvas.background = 'navy';
  canvas._ctx.calls.length = 0;
  canvas.clear();
  assert.deepEqual(canvas._ctx.calls, [['fillRect', 0, 0, 400, 300]]);
  assert.equal(canvas._ctx.fillStyle, 'navy');
  assert.equal(canvas._shapes.length, 0);
});

test('3D: the point looked at is in the middle, and nearer things are larger', () => {
  const canvas = new CanvasPanel();
  canvas.setCamera(0, 0, 10);
  canvas.line3d(0, 0, 0, 1, 1, 0);     // 10 away
  canvas.line3d(0, 0, 5, 1, 1, 5);     // 5 away
  const [far, near] = canvas._projected();
  assert.deepEqual(far.points[0], [200, 150]);
  assert.deepEqual(near.points[0], [200, 150]);
  const dx = (s) => s.points[1][0] - s.points[0][0];
  const dy = (s) => s.points[1][1] - s.points[0][1];
  assert.ok(dx(far) > 0 && dy(far) < 0, 'x is to the right and y is up');
  assert.ok(Math.abs(dx(near) - 2 * dx(far)) < 1e-9, 'twice as near is twice as large');
});

test('3D: shapes are drawn farthest first, and those behind the camera not at all', () => {
  const canvas = new CanvasPanel();
  canvas.setCamera(0, 0, 10);
  canvas.color = 'near';
  canvas.fillTriangle3d(0, 0, 5, 1, 0, 5, 0, 1, 5);
  canvas.color = 'far';
  canvas.fillTriangle3d(0, 0, -5, 1, 0, -5, 0, 1, -5);
  canvas.color = 'behind';
  canvas.fillTriangle3d(0, 0, 20, 1, 0, 20, 0, 1, 20);
  assert.deepEqual(canvas._projected().map((s) => s.color), ['far', 'near']);
  // From the other side all three are in front, in the opposite order.
  canvas.setCamera(0, 0, -10);
  assert.deepEqual(canvas._projected().map((s) => s.color), ['behind', 'near', 'far']);
});

test('3D: orbit() circles the point looked at; a solid box has six shaded sides', () => {
  const canvas = new CanvasPanel();
  canvas.lookAt(1, 2, 3);
  canvas.orbit(90, 4, 10);
  assert.deepEqual(canvas._eye.map((v) => Math.round(v * 1e6) / 1e6), [11, 6, 3]);
  canvas.orbit(0, 0, 10);
  assert.deepEqual(canvas._eye.map((v) => Math.round(v * 1e6) / 1e6), [1, 2, 13]);
  canvas.fillBox3d(1, 2, 3, 2, 2, 2);
  const sides = canvas._projected();
  assert.equal(sides.length, 6);
  for (const side of sides) assert.ok(side.shade >= 0.45 && side.shade <= 1);
  assert.ok(new Set(sides.map((s) => s.shade.toFixed(3))).size >= 3, 'sides facing different ways are shaded differently');
  canvas.autoUpdate = false;       // (here every change is shown at once: there is no animation frame)
  assert.throws(() => { for (let i = 0; i < 20001; i++) canvas.line3d(0, 0, 0, 1, 1, 1); }, RangeError);
});

test('update() shows the 2D drawing with the 3D shapes over it; autoUpdate can be turned off', () => {
  const canvas = new CanvasPanel();
  const screen = canvas._screen;
  canvas.autoUpdate = false;
  screen.calls.length = 0;
  canvas.fillRect(0, 0, 10, 10);
  canvas.color = 'green';
  canvas.fillTriangle3d(0, 0, 0, 1, 0, 0, 0, 1, 0);
  assert.deepEqual(screen.calls, [], 'nothing is shown until update()');
  canvas.update();
  assert.deepEqual(names(screen), ['setTransform', 'drawImage', 'setTransform',
    'beginPath', 'moveTo', 'lineTo', 'lineTo', 'closePath', 'fill', 'fill']);
  assert.equal(screen.calls[1][1], canvas._paint);
  screen.calls.length = 0;
  canvas.autoUpdate = true;        // shows what has been drawn
  assert.ok(names(screen).includes('drawImage'));
});

test('clicks give units, whatever size the canvas is shown at; keys are tracked', () => {
  const canvas = new CanvasPanel();
  canvas.canvas.box = { left: 100, top: 50, width: 800, height: 600 };   // shown at twice its size
  const seen = [];
  canvas.element.addEventListener('canvasclick', (e) => seen.push(e.detail));
  canvas.element.addEventListener('canvaskey', (e) => seen.push(e.detail));
  canvas.canvas.dispatchEvent(event('click', { clientX: 300, clientY: 250 }));
  assert.deepEqual(seen, [{ x: 100, y: 100 }]);
  assert.deepEqual([canvas.mouseX, canvas.mouseY], [100, 100]);
  assert.equal(canvas.canvas.focused, true);
  canvas.canvas.dispatchEvent(event('keydown', { key: 'ArrowLeft' }));
  canvas.canvas.dispatchEvent(event('keydown', { key: 'ArrowLeft', repeat: true }));   // held: no second event
  canvas.canvas.dispatchEvent(event('keydown', { key: ' ' }));
  assert.deepEqual(seen.slice(1), [{ key: 'left' }, { key: 'space' }]);
  assert.deepEqual([canvas.isKeyDown('Left'), canvas.isKeyDown('SPACE'), canvas.isKeyDown('a')], [true, true, false]);
  canvas.canvas.dispatchEvent(event('keyup', { key: 'ArrowLeft' }));
  assert.equal(canvas.isKeyDown('left'), false);
  assert.deepEqual(['ArrowUp', 'A', 'Enter', ' '].map(keyName), ['up', 'a', 'enter', 'space']);
});

test('the drawing is fitted into the panel, keeping its shape', () => {
  const canvas = new CanvasPanel();           // 4 : 3
  canvas.setBounds(0, 0, 600, 300);
  canvas.layout();
  assert.deepEqual([canvas.canvas.style.width, canvas.canvas.style.height, canvas.canvas.style.left, canvas.canvas.style.top],
    ['400px', '300px', '100px', '0px']);
});

test('reset() puts the canvas back as new', () => {
  const canvas = new CanvasPanel();
  canvas.setSize(50, 50);
  canvas.color = 'red';
  canvas.autoUpdate = false;
  canvas.setCamera(1, 1, 1);
  canvas.line3d(0, 0, 0, 1, 1, 1);
  canvas.reset();
  assert.deepEqual([canvas.width, canvas.height, canvas.color, canvas.background, canvas.autoUpdate, canvas._shapes.length],
    [400, 300, '#000000', '#ffffff', true, 0]);
  assert.deepEqual(canvas._eye, [4, 3, 6]);
});

// ------------------------------------------------------ ConsoleOutputHost

test('a console\'s host makes the Canvas, shows its tab and runs its methods', () => {
  const tabs = [];
  const canvasPanel = new CanvasPanel();
  const boardPanel = { element: new FakeElement('div'), setSize() {} };
  const host = new ConsoleOutputHost({ boardPanel, canvasPanel, selectTab: (label) => tabs.push(label) });
  const id = host.create('Canvas', []);
  assert.equal(host.create('Canvas', []), id);
  assert.equal(host.classOf(id), 'Canvas');
  assert.deepEqual(tabs, ['Canvas', 'Canvas']);
  host.call(id, 'setSize', [200, 100]);
  host.call(id, 'setColor', ['blue']);
  host.call(id, 'fillBox3d', [0, 0, 0, 1, 1, 1]);
  assert.deepEqual([host.call(id, 'getWidth', []), host.call(id, 'getHeight', []), canvasPanel.color], [200, 100, 'blue']);
  assert.equal(canvasPanel._shapes.length, 6);
  const clicks = [];
  host.call(id, 'onClick', [(x, y) => clicks.push([x, y])]);
  host.call(id, 'onKey', [(key) => clicks.push(key)]);
  canvasPanel.canvas.box = { left: 0, top: 0, width: 200, height: 100 };
  canvasPanel.canvas.dispatchEvent(event('click', { clientX: 20, clientY: 30 }));
  canvasPanel.canvas.dispatchEvent(event('keydown', { key: 'a' }));
  assert.deepEqual(clicks, [[20, 30], 'a']);
  assert.equal(host.call(id, 'isKeyDown', ['A']), true);
  assert.throws(() => host.call(id, 'setSize', [0, 1]), { name: 'WidgetError' });
  assert.throws(() => host.call(id, 'fly', []), { name: 'WidgetError', message: /no method 'fly'/ });
  assert.throws(() => host.create('Label', ['x']), { name: 'WidgetError', message: /only a Board and a Canvas/ });
  host.reset();
  assert.equal(host.has(id), false);
  assert.equal(canvasPanel.width, 400);
  canvasPanel.canvas.dispatchEvent(event('click', { clientX: 20, clientY: 30 }));
  assert.equal(clicks.length, 2);
});
