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
// walls. The sides of the world are solid unless setWalls(false).
//
// Shapes can be combined into a composite: a group is one rigid body made of
// several parts (each part is one of the shapes above, placed relative to the
// group). The group has one mass, centre of mass and spin, so it moves,
// turns, falls and collides as a whole, and can be resized (scaleBody) and
// animated (moveTo, rotateTo, scaleTo, oscillate) as a whole; a part can be
// detached again. A fixed body that is given a speed or a spin, or an
// animation, moves by itself and pushes everything else (a windmill, a lift).
// Angles in
// the API are in degrees, as on the Canvas's orbit; inside the engine they are
// radians. Collisions are found with the separating axis theorem and
// resolved with sequential impulses (several passes over the contacts, with a
// small push-apart so shapes do not sink into each other).

export const DEFAULT_WIDTH = 400;
export const DEFAULT_HEIGHT = 300;
export const MAX_SIDE = 4000;
export const MAX_BODIES = 400;           // shapes (the parts of groups count)
export const MIN_SCALE = 0.05;            // how far scaleBody can shrink a body from its size when made
export const MAX_SCALE = 20;               // ...and grow it
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
const smooth = (u) => u * u * (3 - 2 * u);

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

/**
 * One shape: a circle or a convex polygon, with its own look and material. It
 * belongs to a Body, and has a pose in the body's frame (lx, ly, la) and one
 * in the world (x, y, angle) that the body keeps up to date. A shape made by
 * addCircle... is a body with one part, and both have the same id.
 */
export class Part {
  constructor(id, shape, collider) {
    this.id = id;
    this.shape = shape;          // 'circle' | 'ball' | 'rect' | 'ellipse' | 'polygon'
    this.collider = collider;    // { type: 'circle', r } or { type: 'poly', verts }
    this.body = null;
    this.lx = 0; this.ly = 0; this.la = 0;      // in the body's frame (la in radians)
    this.x = 0; this.y = 0; this.angle = 0;     // in the world
    this.bounce = shape === 'ball' ? 0.8 : 0.4;
    this.friction = 0.4;
    this.color = COLORS[(id - 1) % COLORS.length];
    this.label = '';
    this._measure();
  }

  _measure() {
    const c = this.collider;
    if (c.type === 'circle') {
      this.radius = c.r;
      this.mass = Math.PI * c.r * c.r * DENSITY;
      this.inertia = 0.5 * this.mass * c.r * c.r;       // about its own centre
      this.normals = null;
    } else {
      const props = polygonProperties(c.verts);
      this.mass = props.mass;
      this.inertia = props.inertia;
      this.normals = faceNormals(c.verts);
      this.radius = Math.max(...c.verts.map(([px, py]) => Math.hypot(px, py)));
    }
  }

  /** Makes the shape f times as large, and its place in the body f times as far from the body's centre. */
  scaleBy(f) {
    if (this.collider.type === 'circle') this.collider = { type: 'circle', r: this.collider.r * f };
    else this.collider = { type: 'poly', verts: this.collider.verts.map(([px, py]) => [px * f, py * f]) };
    this.lx *= f;
    this.ly *= f;
    this._measure();
  }

  /** The vertices in world coordinates (polygons only). */
  worldVerts() {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return this.collider.verts.map(([px, py]) => [this.x + px * c - py * s, this.y + px * s + py * c]);
  }
}

/**
 * A rigid body: one or more parts that move as one. Its position (x, y) is
 * its centre of mass. Read it; change it through PhysicsWorld.
 */
export class Body {
  constructor(world, id, x, y, isGroup = false) {
    this.world = world;
    this.id = id;
    this.isGroup = isGroup;      // made by addGroup / combine, so it can have parts attached and detached
    this.parts = [];
    this.x = x; this.y = y;
    this.angle = 0;              // radians
    this.vx = 0; this.vy = 0;
    this.spin = 0;               // radians per second
    this.fixed = false;
    this.asleep = false;         // still for a while: solid, but not moved until something hits it
    this.still = 0;              // seconds it has been nearly still
    this.scale = 1;              // its size compared with when it was made
    this.anims = [];             // the animations running (moveTo, rotateTo, scaleTo, oscillate)
    this.driven = false;         // moved by an animation this substep: solid and unmoved by others, like a fixed body
    this.mass = 0; this.inertia = 0; this.radius = 0;
    this.invMass = 0; this.invInertia = 0;
    this._im = 0; this._ii = 0;
  }

  /** Adds a part whose pose in the body's frame is already set; call refresh() after. */
  addPart(part) {
    part.body = this;
    this.parts.push(part);
  }

  /** True while it moves by itself: animated, or fixed but given a speed. */
  get active() {
    return this.anims.length > 0 || (this.fixed && (this.vx !== 0 || this.vy !== 0 || this.spin !== 0));
  }

  /**
   * Works out the body's mass, centre of mass, inertia and reach from its
   * parts, and moves its origin to the centre of mass (the parts keep their
   * places in the world).
   */
  refresh() {
    if (this.parts.length === 0) {
      this.mass = 0; this.inertia = 0; this.radius = 0;
      this._setMass();
      return;
    }
    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (const p of this.parts) { mass += p.mass; cx += p.mass * p.lx; cy += p.mass * p.ly; }
    cx /= mass; cy /= mass;
    if (cx !== 0 || cy !== 0) {
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      const wx = cx * c - cy * s;
      const wy = cx * s + cy * c;
      this.x += wx; this.y += wy;
      this.vx -= this.spin * wy; this.vy += this.spin * wx;      // the speed of the new reference point
      for (const p of this.parts) { p.lx -= cx; p.ly -= cy; }
    }
    this.mass = mass;
    this.inertia = this.parts.reduce((sum, p) => sum + p.inertia + p.mass * (p.lx * p.lx + p.ly * p.ly), 0);
    this.radius = Math.max(...this.parts.map((p) => Math.hypot(p.lx, p.ly) + p.radius));
    this._setMass();
    this.sync();
  }

  _setMass() {
    this.invMass = this.fixed || !this.mass ? 0 : 1 / this.mass;
    this.invInertia = this.fixed || !this.inertia ? 0 : 1 / this.inertia;
    this._im = this.invMass;     // what the solver uses: 0 while asleep or driven
    this._ii = this.invInertia;
  }

  /** Puts every part in the world from the body's pose. */
  sync() {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    for (const p of this.parts) {
      p.x = this.x + p.lx * c - p.ly * s;
      p.y = this.y + p.lx * s + p.ly * c;
      p.angle = this.angle + p.la;
    }
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
    this.sleeping = false;         // every body is asleep or fixed and still, and nothing is animated
    this.onChange = null;          // called when something changed that must be drawn
    this.onCollide = null;         // (idA, idB, speed): bodies hit; a side of the world is id 0
    this.bodies = new Map();       // id -> Body (a shape or a group), in the order they were made
    this.parts = new Map();        // id -> Part, for every shape, whether alone or in a group
    this._nextId = 1;
    this._wallBodies = [];
    this._time = 0;                // left over from the last step()
    this._touching = new Set();    // pairs in contact in the last substep
    this._events = [];
    this._makeWalls();
  }

  // ---- the world

  /** Changes the size of the world (bodies that are outside it end up against its walls). */
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

  /** Removes every shape and group. */
  clear() {
    this.bodies.clear();
    this.parts.clear();
    this._touching.clear();
    this.wake();
  }

  /** The number of bodies: shapes on their own, and groups (a group counts once). */
  get count() { return this.bodies.size; }

  /** Lets the world move again, puts every part where its body is, and tells whoever draws it. */
  wake() {
    this.sleeping = false;
    for (const b of this.bodies.values()) { b.asleep = false; b.still = 0; b.sync(); }
    this.onChange?.();
  }

  _makeWalls() {
    const { width: w, height: h } = this;
    const wall = (x, y, hw, hh) => {
      const b = new Body(this, 0, x, y);
      const part = new Part(0, 'rect', { type: 'poly', verts: rectVerts(hw, hh) });
      part.bounce = 0.5;
      part.friction = 0.4;
      b.addPart(part);
      b.fixed = true;
      b.refresh();
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

  _checkRoom() {
    if (this.parts.size >= MAX_BODIES || this.bodies.size >= MAX_BODIES) {
      throw new RangeError(`a world holds at most ${MAX_BODIES} shapes: clear() or remove some`);
    }
  }

  _add(shape, x, y, collider) {
    this._checkRoom();
    const id = this._nextId;
    const part = new Part(id, shape, collider);
    const body = new Body(this, id, checkNumber(x, 'x'), checkNumber(y, 'y'));
    body.addPart(part);
    body.refresh();
    this._nextId += 1;
    this.bodies.set(id, body);
    this.parts.set(id, part);
    this.wake();
    return id;
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

  // ---- groups: composite shapes

  /** An empty group at (x, y); attach() shapes to it. Returns its id. */
  addGroup(x, y) {
    this._checkRoom();
    const id = this._nextId;
    const body = new Body(this, id, checkNumber(x, 'x'), checkNumber(y, 'y'), true);
    this._nextId += 1;
    this.bodies.set(id, body);
    this.wake();
    return id;
  }

  /**
   * Moves a shape (or all the parts of another group) into a group, where it
   * is now; it keeps its id as a part. The group keeps its own fixed or loose
   * state, and the pieces' momentum is shared out between them.
   */
  attach(groupId, shapeId) {
    const group = this.body(groupId);
    if (!group.isGroup) throw new RangeError(`${groupId} is a single shape, not a group: make a group with addGroup, or join two shapes with combine`);
    const source = this.body(shapeId);
    if (source === group) throw new RangeError('a group cannot be attached to itself');
    this._merge(group, source);
    this.wake();
  }

  /** Joins two shapes or groups into a new group, returning its id; both stay where they are. The group is fixed if either is. */
  combine(idA, idB) {
    const a = this.body(idA);
    const b = this.body(idB);
    if (a === b) throw new RangeError('combine needs two different shapes');
    this._checkRoom();
    const id = this._nextId;
    const group = new Body(this, id, a.x, a.y, true);
    this._nextId += 1;
    this.bodies.set(id, group);
    this._merge(group, a);
    this._merge(group, b);
    group.fixed = a.fixed || b.fixed;
    if (group.fixed) { group.vx = 0; group.vy = 0; group.spin = 0; }
    group._setMass();
    this.wake();
    return id;
  }

  // Moves every part of `source` into `group` (keeping its place in the world),
  // and removes `source`, sharing out the momentum.
  _merge(group, source) {
    const before = [group, source].filter((b) => b.mass > 0).map((b) => ({
      mass: b.mass, inertia: b.inertia, x: b.x, y: b.y, vx: b.vx, vy: b.vy, spin: b.spin,
    }));
    const c = Math.cos(group.angle);
    const s = Math.sin(group.angle);
    for (const p of source.parts) {
      const dx = p.x - group.x;
      const dy = p.y - group.y;
      p.lx = dx * c + dy * s;
      p.ly = -dx * s + dy * c;
      p.la = p.angle - group.angle;
      group.addPart(p);
    }
    source.parts = [];
    this.bodies.delete(source.id);
    group.refresh();
    if (group.fixed || before.length === 0) return;
    const mass = before.reduce((sum, b) => sum + b.mass, 0);
    group.vx = before.reduce((sum, b) => sum + b.mass * b.vx, 0) / mass;
    group.vy = before.reduce((sum, b) => sum + b.mass * b.vy, 0) / mass;
    // Angular momentum about the new centre of mass.
    const momentum = before.reduce((sum, b) => sum + b.inertia * b.spin
      + b.mass * cross2(b.x - group.x, b.y - group.y, b.vx, b.vy), 0);
    group.spin = group.inertia > 0 ? momentum / group.inertia : 0;
  }

  /** Takes a part out of its group, to be a shape on its own again (same id), moving as it was. */
  detach(partId) {
    const part = this.parts.get(partId);
    if (!part) {
      if (this.bodies.has(partId)) throw new RangeError(`${partId} is a group: detach one of the shapes in it`);
      throw new RangeError(`there is no shape ${partId} (it was never made, or was removed)`);
    }
    const group = part.body;
    if (group.id === partId) throw new RangeError(`shape ${partId} is not in a group`);
    const rx = part.x - group.x;
    const ry = part.y - group.y;
    const loose = new Body(this, partId, part.x, part.y);
    loose.angle = part.angle;
    loose.vx = group.vx - group.spin * ry;
    loose.vy = group.vy + group.spin * rx;
    loose.spin = group.spin;
    loose.fixed = group.fixed;
    group.parts = group.parts.filter((p) => p !== part);
    group.refresh();
    part.lx = 0; part.ly = 0; part.la = 0;
    loose.addPart(part);
    loose.refresh();
    this.bodies.set(partId, loose);
    this.wake();
  }

  /** The id of the group a shape is in, or 0 if it is not in one. */
  groupOf(id) {
    const part = this.parts.get(id);
    if (!part) { this.body(id); return 0; }
    return part.body.id === id ? 0 : part.body.id;
  }

  /** How many shapes a body is made of (1 for a shape on its own). */
  partCount(id) { return this._partsOf(id).length; }

  // ---- looking up

  /** The body with this id (a shape on its own, or a group); a RangeError if there is none, or it is a part of a group. */
  body(id) {
    const b = this.bodies.get(id);
    if (b) return b;
    const p = this.parts.get(id);
    if (p) throw new RangeError(`shape ${id} is part of group ${p.body.id}: use the group's id for this`);
    throw new RangeError(`there is no shape ${id} (it was never made, or was removed)`);
  }

  /** The single shape with this id (alone or in a group); a RangeError if there is none, or it is a group. */
  part(id) {
    const p = this.parts.get(id);
    if (p) return p;
    if (this.bodies.has(id)) throw new RangeError(`${id} is a group, not a single shape`);
    throw new RangeError(`there is no shape ${id} (it was never made, or was removed)`);
  }

  // The parts an id stands for: all of a group's, or the one shape's.
  _partsOf(id) {
    const b = this.bodies.get(id);
    if (b) return b.parts;
    return [this.part(id)];
  }

  /** Where a body or a part of a group is: its centre (a group's is its centre of mass) and angle in radians. */
  pose(id) {
    const b = this.bodies.get(id);
    if (b) return { x: b.x, y: b.y, angle: b.angle };
    const p = this.part(id);
    return { x: p.x, y: p.y, angle: p.angle };
  }

  /** How fast the point at the centre of a body or part is moving. */
  velocityOf(id) {
    const b = this.bodies.get(id);
    if (b) return { vx: b.vx, vy: b.vy };
    const p = this.part(id);
    const g = p.body;
    return { vx: g.vx - g.spin * (p.y - g.y), vy: g.vy + g.spin * (p.x - g.x) };
  }

  /** How large a body is compared with when it was made (1 at first). */
  scaleOf(id) { return this.body(id).scale; }

  remove(id) {
    const b = this.bodies.get(id);
    if (b) {
      for (const p of b.parts) this.parts.delete(p.id);
      this.bodies.delete(id);
    } else {
      const p = this.part(id);
      p.body.parts = p.body.parts.filter((q) => q !== p);
      p.body.refresh();
      this.parts.delete(id);
    }
    this.wake();
  }

  // ---- looks and materials: for a group, its parts

  setColor(id, color) {
    for (const p of this._partsOf(id)) p.color = String(color);
    this.wake();
  }

  /** Text drawn on the shape (on a group, on its first shape). */
  setLabel(id, text) {
    const [first] = this._partsOf(id);
    if (first) first.label = String(text);
    this.wake();
  }

  setBounce(id, bounce) {
    const v = Math.min(Math.max(checkNumber(bounce, 'a bounce'), 0), 1);
    for (const p of this._partsOf(id)) p.bounce = v;
    this.wake();
  }

  setFriction(id, friction) {
    const v = Math.min(Math.max(checkNumber(friction, 'a friction'), 0), 2);
    for (const p of this._partsOf(id)) p.friction = v;
    this.wake();
  }

  // ---- motion: a body, or a group as a whole

  /** A fixed body never moves for gravity or a hit; given a speed, a spin or an animation, it moves by itself. */
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
  setAngle(id, degrees) {
    this.body(id).angle = checkNumber(degrees, 'an angle') * DEG;
    this.wake();
  }

  /** Sets how fast the body turns, in degrees per second. */
  setSpin(id, degreesPerSecond) {
    this.body(id).spin = checkNumber(degreesPerSecond, 'a spin') * DEG;
    this.wake();
  }

  /** Adds to the body's velocity as a push of this size would (a heavy body moves less). */
  applyImpulse(id, ix, iy) {
    const b = this.body(id);
    b.vx += checkNumber(ix, 'an impulse') * b.invMass;
    b.vy += checkNumber(iy, 'an impulse') * b.invMass;
    this.wake();
  }

  /** Makes a body (and all of a group) f times as large, about its centre of mass. */
  scaleBody(id, f) {
    this._scale(this.body(id), checkNumber(f, 'a scale'));
    this.wake();
  }

  _scale(b, f) {
    if (!(f > 0)) throw new RangeError(`a scale must be above 0, not ${f}`);
    const total = b.scale * f;
    if (total < MIN_SCALE || total > MAX_SCALE) {
      throw new RangeError(`a body can be from ${MIN_SCALE} to ${MAX_SCALE} times its size when made, not ${Math.round(total * 1000) / 1000}`);
    }
    if (b.radius * f > MAX_SIDE) throw new RangeError(`a body can be at most ${MAX_SIDE} units across`);
    for (const p of b.parts) p.scaleBy(f);
    b.scale = total;
    b.refresh();
  }

  // ---- animation: smooth motions the world carries out

  _animation(id, make) {
    const b = this.body(id);
    b.anims = b.anims.filter((a) => a.type !== make.type);     // a new one replaces the one of its kind
    b.anims.push({ t: 0, ...make });
    this.wake();
  }

  /** Slides the body to (x, y) in this many seconds, easing in and out; it is solid and unmoved by hits meanwhile. */
  moveTo(id, x, y, seconds) {
    const b = this.body(id);
    checkNumber(x, 'x'); checkNumber(y, 'y');
    if (!(seconds > 0)) { this.setPosition(id, x, y); return; }
    this._animation(id, { type: 'move', dur: seconds, dx: x - b.x, dy: y - b.y });
  }

  /** Turns the body to this angle (degrees) in this many seconds, easing in and out. */
  rotateTo(id, degrees, seconds) {
    const b = this.body(id);
    checkNumber(degrees, 'an angle');
    if (!(seconds > 0)) { this.setAngle(id, degrees); return; }
    this._animation(id, { type: 'rotate', dur: seconds, da: degrees * DEG - b.angle });
  }

  /** Grows or shrinks the body to this many times its size when made, in this many seconds. */
  scaleTo(id, factor, seconds) {
    const b = this.body(id);
    checkNumber(factor, 'a scale');
    if (factor < MIN_SCALE || factor > MAX_SCALE) {
      throw new RangeError(`a body can be from ${MIN_SCALE} to ${MAX_SCALE} times its size when made, not ${factor}`);
    }
    if (!(seconds > 0)) { this.scaleBody(id, factor / b.scale); return; }
    this._animation(id, { type: 'scale', dur: seconds, from: b.scale, to: factor });
  }

  /**
   * Swings the body back and forth for ever: up to dx and dy units each way
   * from where it is, and degrees each way from its angle, once round every
   * `seconds`. stopAnimation ends it.
   */
  oscillate(id, dx, dy, degrees, seconds) {
    this.body(id);
    checkNumber(dx, 'a distance'); checkNumber(dy, 'a distance'); checkNumber(degrees, 'an angle');
    if (!(seconds > 0)) throw new RangeError(`the time of a swing must be above 0 seconds, not ${seconds}`);
    this._animation(id, { type: 'osc', period: seconds, ax: dx, ay: dy, aa: degrees * DEG });
  }

  /** Ends the body's animations where they are; it stops moving. */
  stopAnimation(id) {
    const b = this.body(id);
    b.anims = [];
    if (b.driven) { b.driven = false; b.vx = 0; b.vy = 0; b.spin = 0; }
    this.wake();
  }

  isAnimating(id) { return this.body(id).anims.length > 0; }

  /** Throws every loose body away from a point (the demo ball's click). */
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

  /** The body with a shape at a point, topmost first (the last made), or null. */
  bodyAt(x, y) {
    let found = null;
    for (const b of this.bodies.values()) {
      for (const p of b.parts) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy > p.radius * p.radius) continue;
        if (p.collider.type === 'circle') { found = b; continue; }
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        if (p.collider.verts.every(([px, py], i) => p.normals[i][0] * (lx - px) + p.normals[i][1] * (ly - py) <= 0)) found = b;
      }
    }
    return found;
  }

  // ---- time

  /**
   * Moves the world on by dt seconds (in fixed substeps). Bodies that hit
   * each other call onCollide(idA, idB, speed) once the step is done.
   */
  step(dt) {
    if (this.paused || this.sleeping) return;
    this._time = Math.min(this._time + Math.max(Number(dt) || 0, 0), SUBSTEP * MAX_SUBSTEPS);
    while (this._time >= SUBSTEP) {
      this._time -= SUBSTEP;
      this._substep(SUBSTEP);
    }
    this.sleeping = [...this.bodies.values()].every((b) => !b.active && (b.fixed || b.asleep));
    const events = this._events;
    this._events = [];
    for (const [a, b, speed] of events) this.onCollide?.(a, b, speed);
  }

  // Carries out the bodies' animations for dt: sets the speed of a body that
  // is moving or turning to just cover this substep's share of the motion.
  _animate(bodies, dt) {
    for (const b of bodies) {
      if (b.anims.length === 0) {
        if (b.driven) { b.driven = false; b.vx = 0; b.vy = 0; b.spin = 0; }
        continue;
      }
      let dx = 0; let dy = 0; let da = 0;
      let drives = false;
      for (const a of b.anims) {
        const t0 = a.t;
        a.t += dt;
        if (a.type === 'osc') {
          const k = Math.sin((2 * Math.PI * a.t) / a.period) - Math.sin((2 * Math.PI * t0) / a.period);
          dx += a.ax * k; dy += a.ay * k; da += a.aa * k;
          drives = true;
        } else if (a.type === 'move' || a.type === 'rotate') {
          const k = smooth(Math.min(1, a.t / a.dur)) - smooth(Math.min(1, t0 / a.dur));
          if (a.type === 'move') { dx += a.dx * k; dy += a.dy * k; } else da += a.da * k;
          drives = true;
          if (a.t >= a.dur) a.done = true;
        } else {                                          // scale
          const target = a.from + (a.to - a.from) * smooth(Math.min(1, a.t / a.dur));
          if (Math.abs(target / b.scale - 1) > 1e-9) this._scale(b, target / b.scale);
          if (a.t >= a.dur) a.done = true;
        }
      }
      b.anims = b.anims.filter((a) => !a.done);
      b.asleep = false;
      b.still = 0;
      if (drives) {
        b.driven = true;
        b.vx = dx / dt; b.vy = dy / dt; b.spin = da / dt;
      } else if (b.driven) {
        b.driven = false; b.vx = 0; b.vy = 0; b.spin = 0;
      }
    }
  }

  _substep(dt) {
    const bodies = [...this.bodies.values()];
    this._animate(bodies, dt);
    for (const b of bodies) {
      b._im = b.asleep || b.driven ? 0 : b.invMass;
      b._ii = b.asleep || b.driven ? 0 : b.invInertia;
      if (b.fixed || b.asleep || b.driven) continue;
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
        if (a.radius < WALL && b.radius < WALL) {      // walls are too big for the quick test
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const reach = a.radius + b.radius;
          if (dx * dx + dy * dy > reach * reach) continue;
        }
        // Something that moves by itself wakes a sleeper it reaches.
        if (a.active && b.asleep) { b.asleep = false; b.still = 0; b._im = b.invMass; b._ii = b.invInertia; }
        if (b.active && a.asleep) { a.asleep = false; a.still = 0; a._im = a.invMass; a._ii = a.invInertia; }
        if (a._im === 0 && b._im === 0) continue;       // neither can be moved
        for (const pa of a.parts) {
          for (const pb of b.parts) {
            const m = collide(pa, pb);
            if (m) manifolds.push(m);
          }
        }
      }
    }
    this._solve(manifolds, dt);
    for (const b of bodies) {
      if (b.asleep) continue;
      const kinematic = b.fixed || b.driven;
      const speed = Math.hypot(b.vx, b.vy);
      if (!kinematic && speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
      if (!kinematic) {
        b.still = speed + Math.abs(b.spin) * b.radius < SLEEP_SPEED ? b.still + dt : 0;
        if (b.still >= SLEEP_TIME) { b.asleep = true; b.vx = 0; b.vy = 0; b.spin = 0; }
      }
    }
    for (const m of manifolds) this._push(m);
    for (const b of bodies) b.sync();
  }

  _solve(manifolds, dt) {
    const touching = new Set();
    const emitted = new Set();
    const rows = [];
    const minBounce = Math.max(BOUNCE_MIN_SPEED, 8 * Math.hypot(this.gravityX, this.gravityY) * dt);
    for (const m of manifolds) {
      const { nx, ny } = m;
      const a = m.a.body;
      const b = m.b.body;
      const tx = -ny;
      const ty = nx;
      const e = Math.max(m.a.bounce, m.b.bounce);
      const mu = Math.sqrt(m.a.friction * m.b.friction);
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
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
        touching.add(key);
        if (vn < -COLLIDE_MIN_SPEED && !this._touching.has(key) && !emitted.has(key)) {
          emitted.add(key);
          this._events.push([a.id, b.id, -vn]);
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

  // Pushes two overlapping bodies apart a little, so they do not sink into each other.
  _push(m) {
    const a = m.a.body;
    const b = m.b.body;
    const total = a._im + b._im;
    if (total === 0) return;
    let depth = 0;
    for (const c of m.contacts) depth += c.depth;
    depth = Math.max(depth / m.contacts.length - SLOP, 0);
    const k = (depth * CORRECTION) / total;
    a.x -= m.nx * k * a._im; a.y -= m.ny * k * a._im;
    b.x += m.nx * k * b._im; b.y += m.ny * k * b._im;
  }
}
