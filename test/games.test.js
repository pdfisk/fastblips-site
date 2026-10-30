// The games in games/: each runs headless on the real Canvas / Physics classes
// over a small stand-in for the DOM, is played with taps, and checked.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import { WidgetError } from '../src/vm/runtime/widgets.js';
import { PhysicsWorld } from '../src/ui/physics.js';
import { CanvasBinding, PhysicsBinding } from '../src/ui/board-host.js';

const games = join(dirname(fileURLToPath(import.meta.url)), '..', 'games');

/** A 2D context that records its calls. */
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
  }
  appendChild(child) { this.children.push(child); return child; }
  getContext() { this.context ??= fakeContext(); return this.context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  focus() {}
}

let CanvasPanel;
before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  globalThis.CustomEvent ??= class extends Event {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail ?? null; }
  };
  ({ CanvasPanel } = await import('../src/ui/widgets/canvas-panel.js'));
});

/** Compiles games/<file> and runs it on a Canvas and a Physics world. */
function play(file) {
  const source = readFileSync(join(games, file), 'utf8');
  const { chunk, loadErrors } = compile(source, { filename: file });
  assert.ok(chunk, `${file} does not compile: ${JSON.stringify(loadErrors)}`);
  const canvas = new CanvasPanel();
  const canvasBinding = new CanvasBinding(canvas);
  const world = new PhysicsWorld();
  const physicsPanel = {
    world, element: new EventTarget(), demo: true,
    reset() { this.demo = true; world.reset(); },
    startProgram() { this.demo = false; world.reset(); },
    layout() {},
  };
  const physicsBinding = new PhysicsBinding(physicsPanel);
  const made = new Map();
  const gui = {
    create(className) {
      if (className === 'Canvas') { made.set(2, className); return 2; }
      if (className === 'Physics') { physicsBinding.start(); made.set(3, className); return 3; }
      throw new WidgetError(`a game can make only a Canvas or a Physics, not a ${className}`);
    },
    has: (id) => made.has(id),
    classOf: (id) => made.get(id),
    call: (id, method, args) => (id === 2 ? canvasBinding : physicsBinding).call(method, args),
  };
  const out = [];
  const vm = new VM(chunk, { gui, out: (t) => out.push(t) });
  const settle = () => { for (let i = 0; i < 5000; i += 1) { if (vm.runSlice(100000)) return; if (vm.waiting) return; vm.takeSleep(); } throw new Error(`${file} does not settle`); };
  settle();
  return {
    vm, canvas, world, physicsPanel, out, settle,
    /** The text drawn so far in the canvas's last picture. */
    texts() {
      return canvas._ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    },
    tap(x, y) {
      canvas.element.dispatchEvent(new CustomEvent('canvasclick', { detail: { x, y } }));
      settle();
    },
    click(x, y) {
      physicsPanel.element.dispatchEvent(new CustomEvent('physicsclick', { detail: { x, y } }));
      settle();
    },
    run(seconds) {
      for (let i = 0; i < seconds * 60; i += 1) world.step(1 / 60);
    },
  };
}


// ---------------------------------------------------------------- helpers

/** A MiniPy value as plain JS: ints to numbers, dicts to objects, lists to arrays. */
function js(v) {
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(js);
  if (v && v.map instanceof Map) return Object.fromEntries(v.entries().map(([k, x]) => [String(js(k)), js(x)]));
  return v;
}

/** The value of a module-level name in the running program. */
function peek(g, name) {
  const slot = g.vm.chunk.globalNames.indexOf(name);
  assert.ok(slot >= 0, `no global called ${name}`);
  return js(g.vm.globals[slot]);
}

/** Every string the program has drawn on its canvas so far. */
const drawn = (g) => g.canvas._ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
const saw = (g, text) => drawn(g).some((t) => t.includes(text));

// ------------------------------------------------------------- lights out

/** The first-row presses that solve a 5 by 5 Lights Out position, or null. */
function solveLights(lights) {
  const N = 5;
  for (let mask = 0; mask < 32; mask += 1) {
    const board = lights.slice();
    const presses = [];
    const press = (r, c) => {
      presses.push([r, c]);
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr; const cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) board[rr * N + cc] ^= 1;
      }
    };
    for (let c = 0; c < N; c += 1) if (mask & (1 << c)) press(0, c);
    for (let r = 1; r < N; r += 1) for (let c = 0; c < N; c += 1) if (board[(r - 1) * N + c]) press(r, c);
    if (board.every((x) => x === 0)) return presses;
  }
  return null;
}

const lightsTap = (g, r, c) => g.tap(20 + c * 56 + 28, 120 + r * 56 + 28);

test('lights-out: every level starts lit and is solvable, a tap flips a cross, solving shows the win and the next level', () => {
  const g = play('lights-out.py');
  for (let level = 1; level <= 4; level += 1) {
    const lights = peek(g, 'lights');
    assert.ok(lights.some((x) => x === 1), `level ${level} starts with lights on`);
    const presses = solveLights(lights);
    assert.ok(presses, `level ${level} can be solved`);
    for (const [r, c] of presses) lightsTap(g, r, c);
    assert.ok(peek(g, 'lights').every((x) => x === 0), 'all lights are off');
    assert.ok(saw(g, `Solved in ${presses.length} moves!`), 'the win is shown');
    g.tap(160, 240);                                   // next level
    assert.ok(saw(g, `Level ${level + 1}`));
  }
});

test('lights-out: a tap flips exactly the light and its neighbours; restart rebuilds the level', () => {
  const g = play('lights-out.py');
  const before = peek(g, 'lights');
  lightsTap(g, 0, 0);                                  // a corner: three lights
  const after = peek(g, 'lights');
  const changed = after.flatMap((x, i) => (x !== before[i] ? [i] : []));
  assert.deepEqual(changed, [0, 1, 5]);
  g.tap(160, 445);                                     // Restart
  assert.deepEqual(peek(g, 'lights'), before);
  assert.ok(saw(g, 'Moves 0'));
});

// --------------------------------------------------------------- flood it

/** How many squares the corner blob owns now. */
function blobSize(grid) {
  const seen = new Set(['0,0']);
  const todo = [[0, 0]];
  const colour = grid[0][0];
  while (todo.length) {
    const [r, c] = todo.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr; const cc = c + dc;
      if (grid[rr]?.[cc] === colour && !seen.has(rr + ',' + cc)) { seen.add(rr + ',' + cc); todo.push([rr, cc]); }
    }
  }
  return seen.size;
}

/** How many squares the corner blob would own after choosing colour. */
function blobAfter(grid, colour) {
  const g = grid.map((row) => row.slice());
  const old = g[0][0];
  if (old === colour) return 0;
  const todo = [[0, 0]];
  g[0][0] = colour;
  let n = 1;
  while (todo.length) {
    const [r, c] = todo.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr; const cc = c + dc;
      if (g[rr]?.[cc] === old) { g[rr][cc] = colour; todo.push([rr, cc]); n += 1; }
    }
  }
  return n;
}

test('flood-it: a move floods the corner, a wasted move is free, the game ends and restarts with a new board', () => {
  const g = play('flood-it.py');
  const first = peek(g, 'grid');
  assert.equal(first.length, 12);
  assert.ok(saw(g, 'Moves left: 22 of 22'));
  // tapping the colour the corner already has costs nothing
  g.tap(16 + 5, 100 + 5);
  assert.ok(saw(g, 'Moves left: 22 of 22'));
  let moves = 0;
  while (!peek(g, 'state').over) {
    const grid = peek(g, 'grid');
    let best = 0; let bestScore = -1;
    for (let colour = 0; colour < 6; colour += 1) {
      const score = blobAfter(grid, colour);
      if (score > bestScore) { bestScore = score; best = colour; }
    }
    g.tap(38 + best * 49, 430);                       // the palette
    moves += 1;
    assert.equal(blobSize(peek(g, 'grid')), bestScore, 'the blob swallowed every touching square of the new colour');
    assert.ok(moves <= 22, 'the game must end within the move limit');
  }
  assert.ok(saw(g, 'You flooded it!') || saw(g, 'Out of moves'));
  g.tap(160, 240);                                    // play again
  assert.notDeepEqual(peek(g, 'grid'), first);
  assert.equal(peek(g, 'state').over, false);
});

test('flood-it: tapping a square on the board chooses its colour', () => {
  const g = play('flood-it.py');
  const grid = peek(g, 'grid');
  let r = 0; let c = 0;
  outer: for (r = 0; r < 12; r += 1) for (c = 0; c < 12; c += 1) if (grid[r][c] !== grid[0][0]) break outer;
  const colour = grid[r][c];
  g.tap(16 + c * 24 + 10, 100 + r * 24 + 10);
  assert.equal(peek(g, 'grid')[0][0], colour);
  assert.equal(peek(g, 'state').moves, 1);
});

// ----------------------------------------------------------- connect four

const col4 = (g, c) => g.tap(20 + c * 40 + 20, 200);
const discs = (b) => b.flat().filter((x) => x !== 0).length;

test('connect-four: you drop a disc, the computer answers, and it blocks three in a column', () => {
  const g = play('connect-four.py');
  const t0 = Date.now();
  col4(g, 0);
  let b = peek(g, 'board');
  assert.equal(b[5][0], 1);
  assert.equal(discs(b), 2, 'the computer replied');
  col4(g, 0);
  col4(g, 0);
  b = peek(g, 'board');
  assert.equal(b[3][0], 1);
  assert.equal(b[2][0], 2, 'the computer blocked the fourth in the column');
  assert.ok(Date.now() - t0 < 20000, 'the computer thinks quickly enough');
});

test('connect-four: it takes a win it is offered, shows it, and a tap starts a new game', () => {
  const g = play('connect-four.py');
  // play down the left edge and let the computer win if it can; the game must end cleanly
  let guard = 0;
  while (!peek(g, 'state').over && guard < 30) {
    const board = peek(g, 'board');
    const open = [6, 5, 0, 1, 2, 3, 4].find((c) => board[0][c] === 0);
    col4(g, open);
    guard += 1;
  }
  const st = peek(g, 'state');
  assert.ok(st.over, 'the game ends');
  assert.ok(/win|draw/i.test(st.message), st.message);
  assert.ok(saw(g, 'Tap to play again'));
  g.tap(160, 240);
  assert.equal(discs(peek(g, 'board')), 1, 'the computer opens the second game');
  assert.equal(peek(g, 'state').over, false);
});

test('connect-four: a full column rejects a tap', () => {
  const g = play('connect-four.py');
  let n = 0;
  while (peek(g, 'board')[0][6] === 0 && n < 12 && !peek(g, 'state').over) { col4(g, 6); n += 1; }
  if (peek(g, 'state').over) return;                  // the game ended first: nothing to check
  const before = discs(peek(g, 'board'));
  col4(g, 6);
  assert.equal(discs(peek(g, 'board')), before);
});

// ------------------------------------------------------------- tower drop

test('tower-drop: blocks fall, a tidy tower scores, falling blocks cost lives, three lives end the game', () => {
  const g = play('tower-drop.py');
  assert.equal(g.world.count, 1, 'just the platform');
  for (let i = 0; i < 4; i += 1) { g.click(160, 100); g.run(2); }
  g.click(160, 100);
  const st = peek(g, 'state');
  assert.equal(st.dropped, 5);
  assert.equal(st.lives, 3);
  assert.ok(st.best >= 2, `a tower stands (best ${st.best})`);
  // blocks dropped far from the platform fall off the side and cost lives
  for (let i = 0; i < 3; i += 1) { g.click(10, 100); g.run(4); }
  g.click(160, 100);
  assert.equal(peek(g, 'state').lives, 0);
  assert.equal(peek(g, 'state').over, true);
  const count = g.world.count;
  g.click(160, 100);                                   // a tap restarts
  assert.equal(peek(g, 'state').over, false);
  assert.equal(g.world.count, 1);
  assert.ok(count > 1);
});

// ----------------------------------------------------------------- plinko

test('plinko: ten balls land in slots, the score adds up, and a tap afterwards restarts', () => {
  const g = play('plinko.py');
  const pegs = g.world.count;
  assert.ok(pegs > 50, `the board is built (${pegs} shapes)`);
  for (let i = 0; i < 10; i += 1) { g.click(60 + i * 20, 50); g.run(0.4); }
  assert.equal(peek(g, 'state').left, 0);
  g.click(160, 50);                                    // no eleventh ball
  assert.equal(g.world.count, pegs + Object.keys(peek(g, 'balls')).length);
  for (let i = 0; i < 40 && Object.keys(peek(g, 'balls')).length > 0; i += 1) { g.run(1); g.vm.events.length; g.settle(); }
  assert.equal(Object.keys(peek(g, 'balls')).length, 0, 'every ball reached a slot');
  const score = peek(g, 'state').score;
  assert.ok(score >= 100 && score % 10 === 0 && score <= 1000, `score ${score}`);
  g.click(160, 50);
  assert.equal(peek(g, 'state').score, 0);
  assert.equal(peek(g, 'state').left, 10);
});

test('plinko: tapping on a ball nudges it instead of dropping another', () => {
  const g = play('plinko.py');
  g.click(160, 50);
  g.run(0.1);
  const [id] = Object.keys(peek(g, 'balls')).map(Number);
  const x = g.world.pose(id).x; const y = g.world.pose(id).y;
  const left = peek(g, 'state').left;
  g.click(x, y);
  assert.equal(peek(g, 'state').left, left, 'no ball was used');
});
