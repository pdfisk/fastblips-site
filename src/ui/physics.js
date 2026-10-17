// Physics: the motion of the bouncing ball of the Physics page of an
// OutputPanel (see physics-panel.js). No DOM is needed, so it also runs (and
// is tested) under Node.
//
// A ball is { x, y, vx, vy, r }: its centre and velocity in pixels (y down)
// and pixels per second, and its radius. The world is a box from (0, 0) to
// (width, height). Gravity pulls the ball down; it loses some of its speed
// on every bounce, and slows down along the floor, until it comes to rest.

export const GRAVITY = 900;           // pixels per second per second
export const RESTITUTION = 0.86;      // the share of its speed a ball keeps in a bounce
export const REST_SPEED = 30;         // a bounce off the floor slower than this ends in rest
export const FLOOR_DRAG = 1.2;        // per second: how fast a ball slows while it touches the floor
export const MAX_STEP = 1 / 30;       // the longest time step, in seconds (a stalled frame is not one leap)
export const KICK_SPEED = 600;

/** A new ball of radius r at the top left of a world, moving to the right. */
export function newBall(r = 14) {
  return { x: r * 2, y: r * 2, vx: 180, vy: 0, r };
}

/**
 * The ball after dt seconds, bouncing off the four sides of the world. The
 * ball is kept inside, so a world made smaller moves it back in.
 * @param {{x: number, y: number, vx: number, vy: number, r: number}} ball
 * @param {number} dt - seconds (above MAX_STEP counts as MAX_STEP)
 * @param {{width: number, height: number, gravity?: number, restitution?: number}} world
 */
export function stepBall(ball, dt, { width, height, gravity = GRAVITY, restitution = RESTITUTION }) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), MAX_STEP);
  const { r } = ball;
  let { x, y, vx, vy } = ball;
  vy += gravity * dt;
  x += vx * dt;
  y += vy * dt;
  const maxX = Math.max(r, width - r);
  const maxY = Math.max(r, height - r);
  if (x < r) { x = r; vx = Math.abs(vx) * restitution; }
  else if (x > maxX) { x = maxX; vx = -Math.abs(vx) * restitution; }
  if (y < r) { y = r; vy = Math.abs(vy) * restitution; }
  else if (y >= maxY) {
    y = maxY;
    vy = -Math.abs(vy) * restitution;
    if (Math.abs(vy) < REST_SPEED) vy = 0;
    vx *= Math.max(0, 1 - FLOOR_DRAG * dt);
  }
  return { x, y, vx, vy, r };
}

/** True when the ball is on the floor and not moving up or down. */
export function atRest(ball, { height }) {
  return ball.vy === 0 && ball.y >= height - ball.r;
}

/**
 * The ball after a kick at a point: it is thrown away from the point, and
 * always upward, so a click on the ball's top still lifts it.
 */
export function kickBall(ball, point, speed = KICK_SPEED) {
  const dx = ball.x - point.x;
  const dy = ball.y - point.y;
  const n = Math.hypot(dx, dy) || 1;
  return { ...ball, vx: (dx / n) * speed, vy: Math.min((dy / n) * speed, -speed * 0.6) };
}
