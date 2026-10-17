// src/ui/physics.js: the bouncing ball of the Physics page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBall, stepBall, kickBall, atRest, MAX_STEP, RESTITUTION } from '../src/ui/physics.js';

const world = { width: 400, height: 300 };

test('a ball falls, speeding up, and moves sideways at a steady speed', () => {
  const a = stepBall({ x: 100, y: 50, vx: 60, vy: 0, r: 10 }, 0.01, world);
  const b = stepBall(a, 0.01, world);
  assert.ok(a.vy > 0 && b.vy > a.vy);
  assert.ok(b.y > a.y && a.y > 50);
  assert.equal(b.vx, 60);
});

test('a ball bounces off the floor, ceiling and walls, keeping some of its speed', () => {
  const floor = stepBall({ x: 100, y: 289, vx: 0, vy: 400, r: 10 }, 0.02, world);
  assert.equal(floor.y, 290);
  assert.ok(floor.vy < 0 && Math.abs(floor.vy + 400 * RESTITUTION) < 20);
  const ceiling = stepBall({ x: 100, y: 11, vx: 0, vy: -300, r: 10 }, 0.02, world);
  assert.equal(ceiling.y, 10);
  assert.ok(ceiling.vy > 0);
  const right = stepBall({ x: 389, y: 100, vx: 300, vy: 0, r: 10 }, 0.02, world);
  assert.equal(right.x, 390);
  assert.ok(right.vx < 0);
  const left = stepBall({ x: 11, y: 100, vx: -300, vy: 0, r: 10 }, 0.02, world);
  assert.equal(left.x, 10);
  assert.ok(left.vx > 0);
});

test('a ball always stays inside the world, even one made smaller, and a long step counts as a short one', () => {
  let ball = { x: 380, y: 280, vx: 500, vy: 500, r: 10 };
  for (let i = 0; i < 500; i += 1) {
    ball = stepBall(ball, 0.016, { width: 100, height: 80 });
    assert.ok(ball.x >= 10 && ball.x <= 90 && ball.y >= 10 && ball.y <= 70);
  }
  const far = stepBall({ x: 100, y: 50, vx: 100, vy: 0, r: 10 }, 60, world);
  const near = stepBall({ x: 100, y: 50, vx: 100, vy: 0, r: 10 }, MAX_STEP, world);
  assert.deepEqual(far, near);
});

test('a dropped ball comes to rest on the floor and stays there', () => {
  let ball = newBall();
  for (let i = 0; i < 60 * 60 && !(atRest(ball, world) && Math.abs(ball.vx) < 1); i += 1) {
    ball = stepBall(ball, 1 / 60, world);
  }
  assert.ok(atRest(ball, world));
  const later = stepBall(ball, 1 / 60, world);
  assert.equal(later.y, ball.y);
  assert.equal(later.vy, 0);
});

test('a kick throws the ball away from the point, and always upward', () => {
  const ball = { x: 200, y: 290, vx: 0, vy: 0, r: 10 };
  const right = kickBall(ball, { x: 150, y: 290 });
  assert.ok(right.vx > 0 && right.vy < 0);
  const left = kickBall(ball, { x: 250, y: 290 });
  assert.ok(left.vx < 0 && left.vy < 0);
  assert.ok(kickBall(ball, { x: 200, y: 400 }).vy < 0);   // a click below it
  assert.ok(Number.isFinite(kickBall(ball, { x: 200, y: 290 }).vx));   // a click on its centre
});
