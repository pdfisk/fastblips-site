// Physics: a small 2D rigid-body engine for the Physics class (New Physics() /
// Physics(), see src/vm/runtime/widgets.js) and the Physics tab of a
// console's output (widgets/physics-panel.js, which draws it). No DOM is
// needed, so it also runs (and is tested) under Node.
//
// The world is a box of 400 by 300 units until setSize says otherwise, with
// (0, 0) at the top left, x to the right and y down, as on the Canvas. Shapes
// fall under gravity, bounce, spin and push each other:
//
//   circle    a flat disc, with a line to show how it turns
//   ball      a circle drawn as a shaded sphere (and bouncier)
//   rect      a rectangle, given by its centre and size
//   ellipse   an ellipse, given by its centre and its two radii
//   polygon   a regular polygon (3 sides is a triangle, 6 a hexagon...)
//
// Every shape is a rigid body with a mass (from its area), a bounce and a
// friction; a body that is `fixed` never moves, which makes platforms and
// walls. The sides of the world are solid unless setWalls(false). Angles in
// the API are in degrees, as on the Canvas's orbit; inside the engine they are
// radians. Collisions are found with the separating axis theorem and
// resolved with sequential impulses (several passes over the contacts, with a
// small push-apart so shapes do not sink into each other).

export const DEFAULT_WIDTH = 400;
export const DEFAULT_HEIGHT = 300;
export const MAX_SIDE = 4000;
export const MAX_BODIES = 400;
export const GRAVITY = 900;               // units per second per second
export const SUBSTEP = 1 / 120;           // seconds: the fixed step the world moves by
export const MAX_SUBSTEPS = 8;            // per call to step(), so a stalled frame does not freeze the page
const ITERATIONS = 12;                    // passes of the contact solver per substep
const SLOP = 0.2;                         // overlap that is left alone, in units
const CORRECTION = 0.4;                   // the share of the remaining overlap pushed apart per substep
const BOUNCE_MIN_SPEED = 20;              // closing slower than this (units/s), and than a few substeps of gravity, shapes do not bounce
const COLLIDE_MIN_SPEED = 60;             // slower contacts are not reported to onCollide
const MAX_SPEED = 3000;
const SPIN_DAMPING = 0.6;                 // per second
const SLEEP_SPEED = 12;                   // units/s: a shape slower than this for SLEEP_TIME falls asleep...
const SLEEP_TIME = 0.5;                   // ...seconds (a sleeping shape is still, and solid to the others)
const WAKE_SPEED = 60;                    // units/s: a shape hit at this speed or more wakes up
const ELLIPSE_SIDES = 24;
const WALL = 100;                         // thickness of the walls, in units
const DENSITY = 0.01;
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131', '#5c7cfa'];

const DEG = Math.PI / 180;

const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;

function checkNumber(value, what) {
  if (!Number.isFinite(value)) throw new RangeError(`${what} must be a finite number, not ${value}`);
  return value;
}

function checkSize(value, what) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_SIDE) {
    throw new RangeError(`${what} must be a number above 0 and up to ${MAX_SIDE}, not ${value}`);
  }
  return value;
}

/** The mass, inertia and radius of a polygon given by its local vertices (centred on its middle). */
function polygonProperties(verts) {
  let area = 0;
  let polar = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const [px, py] = verts[i];
    const [qx, qy] = verts[(i + 1) % verts.length];
    const c = cross2(px, py, qx, qy);
    area += c / 2;
    polar += (c * (px * px + py * py + px * qx + py * qy + qx * qx + qy * qy)) / 12;
  }
  const mass = area * DENSITY;
  return { area, mass, inertia: area > 0 ? (mass / area) * polar : 0 };
}

/** The outward unit normals of a counter-clockwise (in screen terms: clockwise on y down) polygon's faces. */
function faceNormals(verts) {
  return verts.map(([px, py], i) => {
    const [qx, qy] = verts[(i + 1) % verts.length];
    const ex = qx - px;
    const ey = qy - py;
    const n = Math.hypot(ex, ey) || 1;
    return [ey / n, -ex / n];
  });
}

/** One shape in the world. Read it; change it through PhysicsWorld. */
export class Body {
  constructor(world, id, shape, x, y, collider) {
    this.world = world;
    this.id = id;
    this.shape = shape;          // 'circle' | 'ball' | 'rect' | 'ellipse' | 'polygon'
    this.collider = collider;    // { type: 'circle', r } or { type: 'poly', verts }
    this.x = x; this.y = y;
    this.angle = 0;              // radians
    this.vx = 0; this.vy = 0;
    this.spin = 0;               // radians per second
    this.bounce = shape === 'ball' ? 0.8 : 0.4;
    this.friction = 0.4;
    this.color = COLORS[(id - 1) % COLORS.length];
    this.label = '';
    this.fixed = false;
    this.asleep = false;         // still for a while: solid, but not moved until something hits it
    this.still = 0;              // seconds it has been nearly still
    if (collider.type === 'circle') {
      this.radius = collider.r;
      this.mass = Math.PI * collider.r * collider.r * DENSITY;
      this.inertia = 0.5 * this.mass * collider.r * collider.r;
    } else {
      const props = polygonProperties(collider.verts);
      this.mass = props.mass;
      this.inertia = props.inertia;
      this.normals = faceNormals(collider.verts);
      this.radius = Math.max(...collider.verts.map(([px, py]) => Math.hypot(px, py)));
    }
    this._setMass();
  }

  _setMass() {
    this.invMass = this.fixed ? 0 : 1 / this.mass;
    this.invInertia = this.fixed ? 0 : 1 / this.inertia;
    this._im = this.invMass;     // what the solver uses: 0 while asleep
    this._ii = this.invInertia;
  }

  /** The vertices in world coordinates (polygons only). */
  worldVerts() {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return this.collider.verts.map(([px, py]) => [this.x + px * c - py * s, this.y + px * s + py * c]);
  }
}

function rectVerts(hw, hh) {
  // Clockwise on screen (y down), so the normals from faceNormals point outward.
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
}

function regularVerts(rx, ry, sides) {
  const out = [];
  for (let i = 0; i < sides; i += 1) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    out.push([rx * Math.cos(t), ry * Math.sin(t)]);
  }
  return out;
}

// ---- collision detection. A manifold is { a, b, nx, ny, contacts: [{ x, y, depth }] }, the
// normal pointing from a to b.

function collideCircles(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sum = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= sum * sum) return null;
  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 1;
  const ny = d > 1e-9 ? dy / d : 0;
  return { a, b, nx, ny, contacts: [{ x: a.x + nx * a.radius, y: a.y + ny * a.radius, depth: sum - d }] };
}

function collideCirclePoly(c, p) {
  const cos = Math.cos(p.angle);
  const sin = Math.sin(p.angle);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const qx = dx * cos + dy * sin;            // the circle's centre in the polygon's own space
  const qy = -dx * sin + dy * cos;
  const verts = p.collider.verts;
  let best = -Infinity;
  let at = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const [nx, ny] = p.normals[i];
    const s = nx * (qx - verts[i][0]) + ny * (qy - verts[i][1]);
    if (s > c.radius) return null;
    if (s > best) { best = s; at = i; }
  }
  const [v1x, v1y] = verts[at];
  const [v2x, v2y] = verts[(at + 1) % verts.length];
  const toWorld = (lx, ly) => [lx * cos - ly * sin, lx * sin + ly * cos];
  const [fnx, fny] = p.normals[at];
  if (best < 1e-9) {                          // the centre is inside: use the nearest face
    const [wx, wy] = toWorld(fnx, fny);
    return { a: c, b: p, nx: -wx, ny: -wy,
      contacts: [{ x: c.x - wx * c.radius, y: c.y - wy * c.radius, depth: c.radius - best }] };
  }
  const d1 = (qx - v1x) * (v2x - v1x) + (qy - v1y) * (v2y - v1y);
  const d2 = (qx - v2x) * (v1x - v2x) + (qy - v2y) * (v1y - v2y);
  if (d1 <= 0 || d2 <= 0) {                   // nearest to a corner
    const [vx, vy] = d1 <= 0 ? [v1x, v1y] : [v2x, v2y];
    const dist = Math.hypot(qx - vx, qy - vy);
    if (dist > c.radius) return null;
    const [nx, ny] = toWorld((vx - qx) / (dist || 1), (vy - qy) / (dist || 1));
    const [wx, wy] = toWorld(vx, vy);
    return { a: c, b: p, nx, ny, contacts: [{ x: p.x + wx, y: p.y + wy, depth: c.radius - dist }] };
  }
  const [wx, wy] = toWorld(fnx, fny);         // against a face
  return { a: c, b: p, nx: -wx, ny: -wy,
    contacts: [{ x: c.x - wx * c.radius, y: c.y - wy * c.radius, depth: c.radius - best }] };
}

// The face of `a` that the other polygon is least far behind: { separation, face }.
// A positive separation means a gap, so no collision.
function leastPenetration(a, b) {
  const av = a.worldVerts();
  const bv = b.worldVerts();
  const cos = Math.cos(a.angle);
  const sin = Math.sin(a.angle);
  let best = -Infinity;
  let face = 0;
  for (let i = 0; i < av.length; i += 1) {
    const nx = a.normals[i][0] * cos - a.normals[i][1] * sin;
    const ny = a.normals[i][0] * sin + a.normals[i][1] * cos;
    let support = Infinity;                   // the point of b furthest behind the face
    for (const [px, py] of bv) support = Math.min(support, nx * (px - av[i][0]) + ny * (py - av[i][1]));
    if (support > best) { best = support; face = i; }
  }
  return { separation: best, face };
}

function clipSegment(nx, ny, c, seg) {
  const d1 = nx * seg[0][0] + ny * seg[0][1] - c;
  const d2 = nx * seg[1][0] + ny * seg[1][1] - c;
  const out = [];
  if (d1 <= 0) out.push(seg[0]);
  if (d2 <= 0) out.push(seg[1]);
  if (d1 * d2 < 0) {
    const t = d1 / (d1 - d2);
    out.push([seg[0][0] + t * (seg[1][0] - seg[0][0]), seg[0][1] + t * (seg[1][1] - seg[0][1])]);
  }
  return out.length >= 2 ? [out[0], out[1]] : null;
}

function collidePolys(a, b) {
  const pa = leastPenetration(a, b);
  if (pa.separation > 0) return null;
  const pb = leastPenetration(b, a);
  if (pb.separation > 0) return null;
  const flip = pb.separation > pa.separation + 0.01;     // the reference face is the one with less overlap
  const ref = flip ? b : a;
  const inc = flip ? a : b;
  const refFace = flip ? pb.face : pa.face;
  const refVerts = ref.worldVerts();
  const cos = Math.cos(ref.angle);
  const sin = Math.sin(ref.angle);
  const [lnx, lny] = ref.normals[refFace];
  const rnx = lnx * cos - lny * sin;
  const rny = lnx * sin + lny * cos;
  // The incident edge: the face of the other polygon most facing the reference face.
  const incVerts = inc.worldVerts();
  const icos = Math.cos(inc.angle);
  const isin = Math.sin(inc.angle);
  let edge = 0;
  let minDot = Infinity;
  for (let i = 0; i < incVerts.length; i += 1) {
    const nx = inc.normals[i][0] * icos - inc.normals[i][1] * isin;
    const ny = inc.normals[i][0] * isin + inc.normals[i][1] * icos;
    const dot = nx * rnx + ny * rny;
    if (dot < minDot) { minDot = dot; edge = i; }
  }
  const v1 = refVerts[refFace];
  const v2 = refVerts[(refFace + 1) % refVerts.length];
  let seg = [incVerts[edge], incVerts[(edge + 1) % incVerts.length]];
  let sx = v2[0] - v1[0];
  let sy = v2[1] - v1[1];
  const sl = Math.hypot(sx, sy) || 1;
  sx /= sl; sy /= sl;
  seg = clipSegment(-sx, -sy, -(sx * v1[0] + sy * v1[1]), seg);
  if (!seg) return null;
  seg = clipSegment(sx, sy, sx * v2[0] + sy * v2[1], seg);
  if (!seg) return null;
  const refC = rnx * v1[0] + rny * v1[1];
  const contacts = [];
  for (const [px, py] of seg) {
    const sep = rnx * px + rny * py - refC;
    if (sep <= 0) contacts.push({ x: px, y: py, depth: -sep });
  }
  if (contacts.length === 0) return null;
  return { a, b, nx: flip ? -rnx : rnx, ny: flip ? -rny : rny, contacts };
}

function collide(a, b) {
  const ac = a.collider.type === 'circle';
  const bc = b.collider.type === 'circle';
  if (ac && bc) return collideCircles(a, b);
  if (ac) return collideCirclePoly(a, b);
  if (bc) {
    const m = collideCirclePoly(b, a);        // normal from b to a: turn it round
    return m && { a, b, nx: -m.nx, ny: -m.ny, contacts: m.contacts };
  }
  return collidePolys(a, b);
}

export class PhysicsWorld {
  /**
   * @param {{width?: number, height?: number}} [size] - the world's size in units
   */
  constructor({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
    this.width = checkSize(width, 'a width');
    this.height = checkSize(height, 'a height');
    this.gravityX = 0;
    this.gravityY = GRAVITY;
    this.background = '#ffffff';
    this.walls = true;
    this.paused = false;
    this.sleeping = false;         // every shape is asleep, or there is nothing to move
    this.onChange = null;          // called when something changed that must be drawn
    this.onCollide = null;         // (idA, idB, speed): shapes hit; a side of the world is id 0
    this.bodies = new Map();       // id -> Body, in the order they were made
    this._nextId = 1;
    this._wallBodies = [];
    this._time = 0;                // left over from the last step()
    this._touching = new Set();    // pairs in contact in the last substep
    this._events = [];
    this._makeWalls();
  }

  // ---- the world

  /** Changes the size of the world (shapes that are outside it end up against its walls). */
  setSize(width, height) {
    this.width = checkSize(width, 'a width');
    this.height = checkSize(height, 'a height');
    this._makeWalls();
    for (const b of this.bodies.values()) {
      b.x = Math.min(Math.max(b.x, 0), this.width);
      b.y = Math.min(Math.max(b.y, 0), this.height);
    }
    this.wake();
  }

  setGravity(gx, gy) {
    this.gravityX = checkNumber(gx, 'a gravity');
    this.gravityY = checkNumber(gy, 'a gravity');
    this.wake();
  }

  setWalls(on) {
    this.walls = Boolean(on);
    this.wake();
  }

  setPaused(on) {
    this.paused = Boolean(on);
    this.wake();
  }

  setBackground(color) {
    this.background = String(color);
    this.wake();
  }

  /** Back to a new world: 400 by 300, normal gravity, solid sides, no shapes and no handlers. */
  reset() {
    this.width = DEFAULT_WIDTH;
    this.height = DEFAULT_HEIGHT;
    this.gravityX = 0;
    this.gravityY = GRAVITY;
    this.background = '#ffffff';
    this.walls = true;
    this.paused = false;
    this.onCollide = null;
    this._nextId = 1;
    this._time = 0;
    this._makeWalls();
    this.clear();
  }

  /** Removes every shape. */
  clear() {
    this.bodies.clear();
    this._touching.clear();
    this.wake();
  }

  get count() { return this.bodies.size; }

  /** Lets the world move again, and tells whoever draws it. */
  wake() {
    this.sleeping = false;
    for (const b of this.bodies.values()) { b.asleep = false; b.still = 0; }
    this.onChange?.();
  }

  _makeWalls() {
    const { width: w, height: h } = this;
    const wall = (x, y, hw, hh) => {
      const b = new Body(this, 0, 'rect', x, y, { type: 'poly', verts: rectVerts(hw, hh) });
      b.fixed = true;
      b.bounce = 0.5;
      b.friction = 0.4;
      b._setMass();
      return b;
    };
    this._wallBodies = [
      wall(w / 2, h + WALL / 2, w / 2 + WALL, WALL / 2),
      wall(w / 2, -WALL / 2, w / 2 + WALL, WALL / 2),
      wall(-WALL / 2, h / 2, WALL / 2, h / 2 + WALL),
      wall(w + WALL / 2, h / 2, WALL / 2, h / 2 + WALL),
    ];
  }

  // ---- shapes

  _add(shape, x, y, collider) {
    if (this.bodies.size >= MAX_BODIES) throw new RangeError(`a world holds at most ${MAX_BODIES} shapes: clear() or remove some`);
    const body = new Body(this, this._nextId, shape, checkNumber(x, 'x'), checkNumber(y, 'y'), collider);
    this._nextId += 1;
    this.bodies.set(body.id, body);
    this.wake();
    return body.id;
  }

  addCircle(x, y, radius) {
    return this._add('circle', x, y, { type: 'circle', r: checkSize(radius, 'a radius') });
  }

  addBall(x, y, radius) {
    return this._add('ball', x, y, { type: 'circle', r: checkSize(radius, 'a radius') });
  }

  addRect(x, y, width, height) {
    return this._add('rect', x, y, { type: 'poly', verts: rectVerts(checkSize(width, 'a width') / 2, checkSize(height, 'a height') / 2) });
  }

  addEllipse(x, y, rx, ry) {
    return this._add('ellipse', x, y, { type: 'poly', verts: regularVerts(checkSize(rx, 'a radius'), checkSize(ry, 'a radius'), ELLIPSE_SIDES) });
  }

  /** A regular polygon with `sides` corners (3 to 12) on a circle of this radius, one corner up. */
  addPolygon(x, y, radius, sides) {
    if (!Number.isInteger(sides) || sides < 3 || sides > 12) throw new RangeError(`a polygon has 3 to 12 sides, not ${sides}`);
    const r = checkSize(radius, 'a radius');
    return this._add('polygon', x, y, { type: 'poly', verts: regularVerts(r, r, sides) });
  }

  /** The shape with this id; a RangeError if there is none. */
  body(id) {
    const b = this.bodies.get(id);
    if (!b) throw new RangeError(`there is no shape ${id} (it was never made, or was removed)`);
    return b;
  }

  remove(id) {
    this.body(id);
    this.bodies.delete(id);
    this.wake();
  }

  setColor(id, color) { this.body(id).color = String(color); this.wake(); }

  setLabel(id, text) { this.body(id).label = String(text); this.wake(); }

  setFixed(id, on) {
    const b = this.body(id);
    b.fixed = Boolean(on);
    if (b.fixed) { b.vx = 0; b.vy = 0; b.spin = 0; }
    b._setMass();
    this.wake();
  }

  setPosition(id, x, y) {
    const b = this.body(id);
    b.x = checkNumber(x, 'x');
    b.y = checkNumber(y, 'y');
    this.wake();
  }

  setVelocity(id, vx, vy) {
    const b = this.body(id);
    b.vx = checkNumber(vx, 'a speed');
    b.vy = checkNumber(vy, 'a speed');
    this.wake();
  }

  /** Sets the angle, in degrees (0 is as made; positive turns clockwise on the screen). */
  setAngle(id, degrees) { this.body(id).angle = checkNumber(degrees, 'an angle') * DEG; this.wake(); }

  /** Sets how fast the shape turns, in degrees per second. */
  setSpin(id, degreesPerSecond) { this.body(id).spin = checkNumber(degreesPerSecond, 'a spin') * DEG; this.wake(); }

  setBounce(id, bounce) {
    this.body(id).bounce = Math.min(Math.max(checkNumber(bounce, 'a bounce'), 0), 1);
    this.wake();
  }

  setFriction(id, friction) {
    this.body(id).friction = Math.min(Math.max(checkNumber(friction, 'a friction'), 0), 2);
    this.wake();
  }

  /** Adds to the shape's velocity as a push of this size would (a heavy shape moves less). */
  applyImpulse(id, ix, iy) {
    const b = this.body(id);
    b.vx += checkNumber(ix, 'an impulse') * b.invMass;
    b.vy += checkNumber(iy, 'an impulse') * b.invMass;
    this.wake();
  }

  /** Throws every loose shape away from a point (the demo ball's click). */
  kick(x, y, speed = 600) {
    for (const b of this.bodies.values()) {
      if (b.fixed) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const n = Math.hypot(dx, dy) || 1;
      b.vx = (dx / n) * speed;
      b.vy = Math.min((dy / n) * speed, -speed * 0.6);
    }
    this.wake();
  }

  /** The shape at a point, topmost first (the last made), or null. */
  bodyAt(x, y) {
    let found = null;
    for (const b of this.bodies.values()) {
      const dx = x - b.x;
      const dy = y - b.y;
      if (b.collider.type === 'circle') {
        if (dx * dx + dy * dy <= b.radius * b.radius) found = b;
      } else if (dx * dx + dy * dy <= b.radius * b.radius) {
        const cos = Math.cos(b.angle);
        const sin = Math.sin(b.angle);
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        if (b.collider.verts.every(([px, py], i) => {
          const [nx, ny] = b.normals[i];
          return nx * (lx - px) + ny * (ly - py) <= 0;
        })) found = b;
      }
    }
    return found;
  }

  // ---- time

  /**
   * Moves the world on by dt seconds (in fixed substeps). Shapes that hit
   * each other call onCollide(idA, idB, speed) once the step is done.
   */
  step(dt) {
    if (this.paused || this.sleeping) return;
    this._time = Math.min(this._time + Math.max(Number(dt) || 0, 0), SUBSTEP * MAX_SUBSTEPS);
    while (this._time >= SUBSTEP) {
      this._time -= SUBSTEP;
      this._substep(SUBSTEP);
    }
    this.sleeping = [...this.bodies.values()].every((b) => b.fixed || b.asleep);
    const events = this._events;
    this._events = [];
    for (const [a, b, speed] of events) this.onCollide?.(a, b, speed);
  }

  _substep(dt) {
    const bodies = [...this.bodies.values()];
    for (const b of bodies) {
      b._im = b.asleep ? 0 : b.invMass;
      b._ii = b.asleep ? 0 : b.invInertia;
      if (b.fixed || b.asleep) continue;
      b.vx += this.gravityX * dt;
      b.vy += this.gravityY * dt;
      b.spin /= 1 + SPIN_DAMPING * dt;
    }
    const all = this.walls ? [...bodies, ...this._wallBodies] : bodies;
    const manifolds = [];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        if ((a.fixed || a.asleep) && (b.fixed || b.asleep)) continue;
        const reach = a.radius + b.radius;
        if (a.radius < WALL && b.radius < WALL) {      // walls are too big for the quick test
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (dx * dx + dy * dy > reach * reach) continue;
        }
        const m = collide(a, b);
        if (m) manifolds.push(m);
      }
    }
    this._solve(manifolds, dt);
    for (const b of bodies) {
      if (b.fixed || b.asleep) continue;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
      b.still = speed + Math.abs(b.spin) * b.radius < SLEEP_SPEED ? b.still + dt : 0;
      if (b.still >= SLEEP_TIME) { b.asleep = true; b.vx = 0; b.vy = 0; b.spin = 0; }
    }
    for (const m of manifolds) this._push(m);
  }

  _solve(manifolds, dt) {
    const touching = new Set();
    const rows = [];
    for (const m of manifolds) {
      const { a, b, nx, ny } = m;
      const tx = -ny;
      const ty = nx;
      const e = Math.max(a.bounce, b.bounce);
      const minBounce = Math.max(BOUNCE_MIN_SPEED, 8 * Math.hypot(this.gravityX, this.gravityY) * dt);
      const mu = Math.sqrt(a.friction * b.friction);
      for (const c of m.contacts) {
        const rax = c.x - a.x; const ray = c.y - a.y;
        const rbx = c.x - b.x; const rby = c.y - b.y;
        const rn = [cross2(rax, ray, nx, ny), cross2(rbx, rby, nx, ny)];
        const rt = [cross2(rax, ray, tx, ty), cross2(rbx, rby, tx, ty)];
        const kn = a._im + b._im + rn[0] * rn[0] * a._ii + rn[1] * rn[1] * b._ii;
        const kt = a._im + b._im + rt[0] * rt[0] * a._ii + rt[1] * rt[1] * b._ii;
        const vn = this._relative(a, b, rax, ray, rbx, rby, nx, ny);
        rows.push({ a, b, nx, ny, tx, ty, rax, ray, rbx, rby, mu,
          massN: kn > 0 ? 1 / kn : 0, massT: kt > 0 ? 1 / kt : 0,
          bias: vn < -minBounce ? -e * vn : 0, pn: 0, pt: 0 });
        if (vn < -WAKE_SPEED) {                // a hard hit wakes a sleeper
          if (a.asleep) { a.asleep = false; a.still = 0; }
          if (b.asleep) { b.asleep = false; b.still = 0; }
        }
        if (vn < -COLLIDE_MIN_SPEED) {
          const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          touching.add(key);
          if (!this._touching.has(key)) this._events.push([a.id, b.id, -vn]);
        } else {
          touching.add(a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
        }
      }
    }
    this._touching = touching;
    for (let it = 0; it < ITERATIONS; it += 1) {
      for (const r of rows) {
        // Friction first, bounded by the normal impulse so far; then the normal impulse.
        const vt = this._relative(r.a, r.b, r.rax, r.ray, r.rbx, r.rby, r.tx, r.ty);
        const dpt = -vt * r.massT;
        const maxF = r.mu * r.pn;
        const npt = Math.min(Math.max(r.pt + dpt, -maxF), maxF);
        this._impulse(r, r.tx, r.ty, npt - r.pt);
        r.pt = npt;
        const vn = this._relative(r.a, r.b, r.rax, r.ray, r.rbx, r.rby, r.nx, r.ny);
        const dpn = (r.bias - vn) * r.massN;
        const npn = Math.max(r.pn + dpn, 0);
        this._impulse(r, r.nx, r.ny, npn - r.pn);
        r.pn = npn;
      }
    }
  }

  // The speed of b relative to a at a contact, along a direction.
  _relative(a, b, rax, ray, rbx, rby, dx, dy) {
    const vax = a.vx - a.spin * ray;
    const vay = a.vy + a.spin * rax;
    const vbx = b.vx - b.spin * rby;
    const vby = b.vy + b.spin * rbx;
    return (vbx - vax) * dx + (vby - vay) * dy;
  }

  _impulse(r, dx, dy, p) {
    if (p === 0) return;
    const { a, b } = r;
    a.vx -= dx * p * a._im; a.vy -= dy * p * a._im;
    a.spin -= cross2(r.rax, r.ray, dx, dy) * p * a._ii;
    b.vx += dx * p * b._im; b.vy += dy * p * b._im;
    b.spin += cross2(r.rbx, r.rby, dx, dy) * p * b._ii;
  }

  // Pushes two overlapping shapes apart a little, so they do not sink into each other.
  _push(m) {
    const { a, b } = m;
    const ia = a.asleep ? 0 : a.invMass;
    const ib = b.asleep ? 0 : b.invMass;
    const total = ia + ib;
    if (total === 0) return;
    let depth = 0;
    for (const c of m.contacts) depth += c.depth;
    depth = Math.max(depth / m.contacts.length - SLOP, 0);
    const k = (depth * CORRECTION) / total;
    a.x -= m.nx * k * ia; a.y -= m.ny * k * ia;
    b.x += m.nx * k * ib; b.y += m.ny * k * ib;
  }
}
