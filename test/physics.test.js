// src/ui/physics.js (the engine of the Physics class), its binding to the
// Physics tab (PhysicsBinding in src/ui/board-host.js), and the physics
// examples run in both languages against a world with no screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from '../src/index.js';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import { WidgetError } from '../src/vm/runtime/widgets.js';
import { PhysicsWorld, MAX_BODIES } from '../src/ui/physics.js';
import { PhysicsBinding } from '../src/ui/board-host.js';

const DEG = 180 / Math.PI;

/** Runs the world for some seconds of 60 frames a second, or until it sleeps. */
function run(world, seconds) {
  for (let i = 0; i < seconds * 60 && !world.sleeping; i += 1) world.step(1 / 60);
}

function inside(world, body, slack = 5) {
  return Number.isFinite(body.x + body.y + body.angle)
    && body.x > -slack && body.x < world.width + slack && body.y > -slack && body.y < world.height + slack;
}

// ------------------------------------------------------------ the engine

test('a ball falls, speeding up, and bounces off the floor, a little lower each time', () => {
  const world = new PhysicsWorld();
  const id = world.addBall(200, 20, 14);
  const ball = world.body(id);
  world.step(1 / 60);
  const first = ball.vy;
  world.step(1 / 60);
  assert.ok(first > 0 && ball.vy > first);
  const apexes = [];
  let lastVy = ball.vy;
  for (let i = 0; i < 60 * 8; i += 1) {
    world.step(1 / 60);
    if (lastVy < 0 && ball.vy >= 0) apexes.push(ball.y);
    lastVy = ball.vy;
  }
  assert.ok(apexes.length >= 4, `bounced ${apexes.length} times`);
  for (let i = 1; i < apexes.length; i += 1) assert.ok(apexes[i] > apexes[i - 1], 'each bounce is lower');
  assert.ok(ball.y <= 286.5, 'never sinks into the floor');
});

test('shapes come to rest and the world falls asleep', () => {
  const world = new PhysicsWorld();
  const box = world.addRect(200, 100, 60, 30);
  const ball = world.addBall(120, 20, 12);
  run(world, 10);
  assert.equal(world.sleeping, true);
  const b = world.body(box);
  assert.ok(Math.abs(b.y - 285) < 1.5, `box rests on the floor: y ${b.y}`);
  assert.ok(Math.abs(Math.sin(b.angle)) < 0.02, 'and lies flat');
  assert.ok(Math.abs(world.body(ball).y - 288) < 1.5, 'a ball of radius 12 rests 12 above the floor');
  assert.equal(b.vx + b.vy + b.spin, 0);
});

test('a tilted box dropped on the floor ends up flat', () => {
  const world = new PhysicsWorld();
  const id = world.addRect(200, 100, 60, 30);
  world.setAngle(id, 30);
  run(world, 10);
  const b = world.body(id);
  assert.ok(Math.abs(Math.sin(b.angle)) < 0.02, `angle ${b.angle * DEG}`);
  assert.ok(Math.abs(b.y - 285) < 1.5 && inside(world, b));
});

test('boxes stack on each other without falling over', () => {
  const world = new PhysicsWorld();
  const ids = [0, 1, 2, 3].map((i) => world.addRect(200, 270 - i * 32, 60, 30));
  run(world, 10);
  ids.forEach((id, i) => {
    const b = world.body(id);
    assert.ok(Math.abs(b.x - 200) < 12, `box ${i} x ${b.x}`);
    assert.ok(Math.abs(b.y - (285 - i * 30)) < 3, `box ${i} y ${b.y}`);
  });
});

test('a circle rolls down a fixed slope; a fixed shape never moves', () => {
  const world = new PhysicsWorld();
  const ramp = world.addRect(150, 150, 220, 10);
  world.setAngle(ramp, 20);
  world.setFixed(ramp, true);
  const wheel = world.addCircle(80, 60, 12);
  run(world, 8);
  assert.deepEqual([world.body(ramp).x, world.body(ramp).y], [150, 150]);
  assert.ok(world.body(wheel).x > 200, `it rolled to ${world.body(wheel).x}`);
});

test('every kind of shape together: nothing leaves the world, and it all settles', () => {
  const world = new PhysicsWorld();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 50; i += 1) {
    const x = 30 + rnd() * 340;
    const y = 10 + rnd() * 120;
    switch (i % 5) {
      case 0: world.addCircle(x, y, 6 + rnd() * 8); break;
      case 1: world.addBall(x, y, 6 + rnd() * 8); break;
      case 2: world.addRect(x, y, 12 + rnd() * 20, 10 + rnd() * 14); break;
      case 3: world.addEllipse(x, y, 8 + rnd() * 8, 5 + rnd() * 5); break;
      default: world.addPolygon(x, y, 8 + rnd() * 6, 3 + Math.floor(rnd() * 4));
    }
  }
  run(world, 30);
  for (const b of world.bodies.values()) assert.ok(inside(world, b), `${b.shape} ${b.id} at ${b.x}, ${b.y}`);
  assert.equal(world.sleeping, true);
});

test('onCollide reports the ids of the shapes that hit, and 0 for a side of the world', () => {
  const world = new PhysicsWorld();
  const a = world.addBall(200, 50, 10);
  const b = world.addBall(200, 130, 10);
  const hits = [];
  world.onCollide = (x, y, speed) => hits.push([x, y, speed]);
  run(world, 3);
  assert.ok(hits.some(([x, y]) => (x === a && y === b) || (x === b && y === a)), 'ball hits ball');
  assert.ok(hits.some(([x, y]) => x === 0 || y === 0), 'ball hits the floor');
  assert.ok(hits.every(([, , speed]) => speed >= 60));
});

test('gravity, walls and pausing can be changed; reset() starts again', () => {
  const world = new PhysicsWorld();
  const id = world.addBall(200, 100, 10);
  world.setGravity(0, 0);
  world.setVelocity(id, 100, 0);
  run(world, 1);
  assert.ok(Math.abs(world.body(id).y - 100) < 0.5 && world.body(id).x > 280);
  world.setWalls(false);
  world.setVelocity(id, 300, 0);
  run(world, 2);
  assert.ok(world.body(id).x > world.width + 100, 'with no walls it leaves the world');
  world.setPaused(true);
  const at = world.body(id).x;
  world.step(1);
  assert.equal(world.body(id).x, at);
  world.reset();
  assert.deepEqual([world.count, world.gravityY, world.walls, world.paused, world.width], [0, 900, true, false, 400]);
});

test('bodyAt finds the shape under a point, the last made first', () => {
  const world = new PhysicsWorld();
  const box = world.addRect(100, 100, 40, 20);
  const ball = world.addBall(100, 100, 10);
  assert.equal(world.bodyAt(100, 100).id, ball);
  assert.equal(world.bodyAt(115, 100).id, box);
  assert.equal(world.bodyAt(115, 130), null);
  world.setAngle(box, 90);
  assert.equal(world.bodyAt(100, 115).id, box);      // turned to stand upright
});

test('bad shapes and ids are RangeErrors', () => {
  const world = new PhysicsWorld();
  assert.throws(() => world.body(9), RangeError);
  assert.throws(() => world.addCircle(10, 10, 0), RangeError);
  assert.throws(() => world.addPolygon(10, 10, 5, 2), RangeError);
  assert.throws(() => world.addRect(NaN, 10, 5, 5), RangeError);
  assert.throws(() => world.setSize(0, 10), RangeError);
  const id = world.addCircle(10, 10, 5);
  world.remove(id);
  assert.throws(() => world.remove(id), /no shape/);
  for (let i = 0; i < MAX_BODIES; i += 1) world.addCircle(10, 10, 1);
  assert.throws(() => world.addCircle(10, 10, 1), /at most/);
});

// ------------------------------------------------------------ the binding

/** A PhysicsPanel without a DOM: a world and an element that takes events. */
function fakePanel() {
  return {
    world: new PhysicsWorld(),
    element: new EventTarget(),
    demo: true,
    laidOut: 0,
    reset() { this.demo = true; this.world.reset(); },
    startProgram() { this.demo = false; this.world.reset(); },
    layout() { this.laidOut += 1; },
  };
}

test('PhysicsBinding runs the class\'s methods on the panel\'s world', () => {
  const panel = fakePanel();
  const binding = new PhysicsBinding(panel);
  binding.start();
  const ball = binding.call('addBall', [100, 50, 10]);
  const box = binding.call('addRect', [200, 50, 30, 20]);
  assert.equal(binding.call('getCount', []), 2);
  binding.call('setColor', [ball, 'red']);
  binding.call('setAngle', [box, 90]);
  binding.call('setVelocity', [ball, 5, 6]);
  assert.equal(panel.world.part(ball).color, 'red');
  assert.equal(Math.round(binding.call('getAngle', [box])), 90);
  assert.deepEqual([binding.call('getVx', [ball]), binding.call('getVy', [ball])], [5, 6]);
  assert.equal(binding.call('bodyAt', [100, 50]), ball);
  assert.equal(binding.call('bodyAt', [5, 5]), 0);
  binding.call('setSize', [200, 100]);
  assert.deepEqual([binding.call('getWidth', []), binding.call('getHeight', [])], [200, 100]);
  assert.equal(panel.laidOut, 1);
  binding.call('setPaused', [true]);
  assert.equal(binding.call('isPaused', []), true);
  binding.call('removeBody', [box]);
  assert.equal(binding.call('getCount', []), 1);
  assert.throws(() => binding.call('getX', [box]), WidgetError);
  assert.throws(() => binding.call('addPolygon', [1, 1, 5, 2]), WidgetError);
  assert.throws(() => binding.call('fly', []), { name: 'WidgetError', message: /no method 'fly'/ });
});

test('PhysicsBinding: clicks and collisions reach the program\'s handlers; reset() drops them', () => {
  const panel = fakePanel();
  const binding = new PhysicsBinding(panel);
  binding.start();
  const clicks = [];
  const hits = [];
  binding.call('onClick', [(x, y) => clicks.push([x, y])]);
  binding.call('onCollide', [(a, b) => hits.push([a, b])]);
  panel.element.dispatchEvent(new CustomEvent('physicsclick', { detail: { x: 12, y: 34 } }));
  assert.deepEqual(clicks, [[12, 34]]);
  binding.call('addBall', [200, 280, 10]);
  binding.call('setVelocity', [1, 0, 400]);
  run(panel.world, 1);
  assert.deepEqual(hits[0], [1, 0]);           // the ball (id 1) hit a side of the world (id 0)
  binding.reset();
  assert.equal(panel.demo, true);
  panel.element.dispatchEvent(new CustomEvent('physicsclick', { detail: { x: 1, y: 1 } }));
  assert.equal(clicks.length, 1);
});

// ------------------------------------------------------------ the examples

const examples = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');

/** A widget host with only the Physics, on a world with no screen. */
function physicsHost() {
  const panel = fakePanel();
  const binding = new PhysicsBinding(panel);
  return {
    panel,
    create(className) {
      if (className !== 'Physics') throw new WidgetError(`no ${className} here`);
      binding.start();
      return 3;
    },
    has: (id) => id === 3,
    classOf: () => 'Physics',
    call: (id, method, args) => binding.call(method, args),
  };
}

function load(file) {
  const source = readFileSync(join(examples, file), 'utf8');
  if (file.endsWith('.py')) {
    const { chunk, loadErrors } = compilePython(source, { filename: file });
    assert.ok(chunk, JSON.stringify(loadErrors));
    return chunk;
  }
  const { chunk, errors } = compile(source, { filename: file });
  assert.deepEqual(errors.map((e) => e.message), []);
  return chunk;
}

const settle = (vm) => { while (!vm.runSlice(1000)) if (vm.waiting) return; };

// name -> [shapes made at the start, does a click add a shape]
const EXAMPLES = {
  'physics-balls': [12, true],
  'physics-shapes': [17, true],
  'physics-pyramid': [21, true],
  'physics-bumpers': [6, true],
  'physics-gravity': [27, false],
  'physics-composites': [5, true],
  'physics-machine': [24, true],
  'physics-tower': [1, true],
};

for (const [name, [shapes, adds]] of Object.entries(EXAMPLES)) {
  for (const ext of ['crumb', 'py']) {
    test(`${name}.${ext} makes ${shapes} shapes, handles a click and keeps them in the world`, () => {
      const host = physicsHost();
      const out = [];
      const vm = new VM(load(`${name}.${ext}`), { gui: host, out: (t) => out.push(t) });
      settle(vm);
      const { world } = host.panel;
      assert.equal(host.panel.demo, false);
      assert.equal(world.count, shapes);
      assert.ok(out.length >= 1);
      run(world, 4);
      host.panel.element.dispatchEvent(new CustomEvent('physicsclick', { detail: { x: 250, y: 120 } }));
      settle(vm);
      if (adds) assert.equal(world.count, shapes + 1);
      else assert.ok(world.gravityX !== 0 || world.gravityY !== 900, 'gravity was changed');
      world.sleeping = false;
      run(world, 6);
      for (const b of world.bodies.values()) assert.ok(inside(world, b), `${b.shape} ${b.id} at ${b.x}, ${b.y}`);
    });
  }
}

// ------------------------------------------------------------ composites

test('combine joins shapes into one group body with the centre of mass as its position', () => {
  const w = new PhysicsWorld();
  const a = w.addCircle(100, 100, 10);
  const b = w.addCircle(140, 100, 10);
  const g = w.combine(a, b);
  assert.notEqual(g, a);
  assert.notEqual(g, b);
  assert.equal(w.partCount(g), 2);
  assert.equal(w.groupOf(a), g);
  assert.equal(w.count, 1);
  const p = w.pose(g);
  assert.ok(Math.abs(p.x - 120) < 0.01 && Math.abs(p.y - 100) < 0.01);
  assert.throws(() => w.setVelocity(a, 1, 1), /part of group/);
});

test('a group falls and rests as one rigid body, and attach adds a shape', () => {
  const w = new PhysicsWorld();
  const a = w.addBall(100, 50, 12);
  const b = w.addBall(140, 50, 12);
  const g = w.combine(a, b);
  const c = w.addBall(120, 50, 12);
  w.attach(g, c);
  assert.equal(w.partCount(g), 3);
  run(w, 10);
  assert.ok(inside(w, w.pose(g)));
  assert.equal(w.sleeping, true);
  const d = w.part(a).x - w.part(b).x;
  assert.ok(Math.abs(Math.abs(d) - 40) < 0.5, 'parts keep their distance');
});

test('detach turns a part back into a shape of its own', () => {
  const w = new PhysicsWorld();
  const a = w.addBall(100, 100, 10);
  const b = w.addBall(140, 100, 10);
  const g = w.combine(a, b);
  w.detach(b);
  assert.equal(w.count, 2);
  assert.equal(w.groupOf(b), 0);
  assert.equal(w.partCount(g), 1);
  assert.doesNotThrow(() => w.setVelocity(b, 5, 5));
});

test('scaleBody scales mass with area and rejects bad factors', () => {
  const w = new PhysicsWorld();
  const a = w.addRect(100, 100, 20, 20);
  const b = w.addRect(130, 100, 20, 20);
  const g = w.combine(a, b);
  const m1 = w.bodies.get(g).mass;
  w.scaleBody(g, 2);
  assert.ok(Math.abs(w.bodies.get(g).mass / m1 - 4) < 0.01);
  assert.equal(w.scaleOf(g), 2);
  assert.throws(() => w.scaleBody(g, 0), RangeError);
  assert.throws(() => w.scaleBody(g, 1000), RangeError);
});

test('moveTo, rotateTo and scaleTo reach their targets and the world then sleeps', () => {
  const w = new PhysicsWorld();
  w.gravity = 0;
  const a = w.addRect(100, 100, 30, 30);
  w.setFixed(a, true);
  w.moveTo(a, 250, 200, 1);
  w.rotateTo(a, 90, 1);
  w.scaleTo(a, 2, 1);
  assert.equal(w.isAnimating(a), true);
  for (let i = 0; i < 200; i += 1) w.step(1 / 60);
  const p = w.pose(a);
  assert.ok(Math.abs(p.x - 250) < 0.5 && Math.abs(p.y - 200) < 0.5);
  assert.ok(Math.abs(w.scaleOf(a) - 2) < 0.01);
  assert.equal(w.isAnimating(a), false);
});

test('oscillate swings a body about its start until stopped', () => {
  const w = new PhysicsWorld();
  const a = w.addRect(200, 150, 20, 20);
  w.setFixed(a, true);
  w.oscillate(a, 60, 0, 0, 2);
  let min = 1e9, max = -1e9;
  for (let i = 0; i < 360; i += 1) { w.step(1 / 60); const x = w.pose(a).x; min = Math.min(min, x); max = Math.max(max, x); }
  assert.ok(max - min > 100 && max - min < 130, `range ${max - min}`);
  w.stopAnimation(a);
  assert.equal(w.isAnimating(a), false);
});

test('a fixed spinning group pushes a ball and stays put', () => {
  const w = new PhysicsWorld();
  const hub = w.addCircle(200, 150, 8);
  const bar = w.addRect(200, 150, 120, 6);
  const mill = w.combine(hub, bar);
  w.setFixed(mill, true);
  w.setSpin(mill, 180);
  const ball = w.addBall(230, 100, 6);
  for (let i = 0; i < 300; i += 1) w.step(1 / 60);
  const p = w.pose(mill);
  assert.ok(Math.abs(p.x - 200) < 0.01 && Math.abs(p.y - 150) < 0.01);
  assert.ok(Math.abs(w.pose(ball).x - 230) > 1 || Math.abs(w.pose(ball).y - 100) > 1);
});

test('the Physics binding drives composites and animations', () => {
  const host = physicsHost();
  const out = [];
  const src = `Dim w = New Physics()
Dim a = w.addBall(100, 100, 10)
Dim b = w.addBall(140, 100, 10)
Dim g = w.combine(a, b)
Print w.getPartCount(g)
Print w.getGroup(a) = g
w.scaleTo(g, 2, 1)
w.moveTo(g, 200, 200, 1)
w.oscillate(g, 10, 0, 0, 2)
Print w.isAnimating(g)
w.stopAnimation(g)
Print w.isAnimating(g)
w.detach(b)
Print w.getPartCount(g)
`;
  const { chunk, errors } = compile(src, { filename: 'composites.crumb' });
  assert.deepEqual(errors.map((e) => e.message), []);
  const vm = new VM(chunk, { gui: host, out: (t) => out.push(t.trim()) });
  settle(vm);
  assert.deepEqual(out, ['2', 'True', 'True', 'False', '1']);
});
