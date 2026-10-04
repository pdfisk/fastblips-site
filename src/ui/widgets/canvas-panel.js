// CanvasPanel: the output page for drawing - 2D and simple 3D graphics, for
// showing data and for games (see docs/widgets.txt).
//
// The drawing has a size of its own, in units (400 by 300 unless setSize
// says otherwise), with (0, 0) at the top left, x to the right and y down.
// It is scaled to fit the panel, keeping its shape, so a program's
// coordinates mean the same in a small console pane and on a full screen.
//
// 2D shapes are painted as they are drawn. 3D shapes are kept in a list and
// drawn over the 2D drawing, farthest first, as seen from the camera; the
// camera can move without the shapes being given again. In 3D, x is to the
// right, y is up and z is toward the viewer.

import { Panel } from './panel.js';

const STYLE = `
.cr-canvas-panel{background:var(--cr-output-bg);overflow:hidden}
.cr-canvas{position:absolute;display:block;outline:0;background:#ffffff}
.cr-canvas:focus-visible{box-shadow:0 0 0 2px var(--cr-list-selected-focus)}
`;

function installStyle() {
  if (document.getElementById('cr-canvas-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-canvas-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const MAX_SIDE = 4000;      // the largest width or height, in units
const SCALE = 2;            // bitmap pixels per unit, so a stretched drawing stays sharp
const MAX_SHAPES = 20000;   // the most 3D shapes kept at once
const NEAR = 0.01;          // 3D shapes closer to the camera than this are not drawn
const FOCAL = 1 / Math.tan((60 * Math.PI) / 360);   // a 60 degree field of view
const LIGHT = normalize([0.35, 0.8, 0.5]);          // where the light comes from

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a) {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

function checkSide(value, what) {
  if (!Number.isFinite(value) || value < 1 || value > MAX_SIDE) {
    throw new RangeError(`a canvas's ${what} must be a number from 1 to ${MAX_SIDE}, not ${value}`);
  }
  return Math.round(value);
}

/** The name a program knows a key by: 'a', '7', 'Left', 'Space', 'Enter', ... in lower case. */
export function keyName(key) {
  const k = String(key);
  if (k === ' ' || k.toLowerCase() === 'spacebar') return 'space';
  return k.replace(/^Arrow/, '').toLowerCase();
}

const SCROLL_KEYS = new Set(['left', 'right', 'up', 'down', 'space']);

export class CanvasPanel extends Panel {
  /** @param {{width?: number, height?: number}} options - the drawing's size, in units */
  constructor({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-canvas-panel');
    // The canvas on the page, and the 2D drawing, kept off the page: the
    // page shows the 2D drawing with the 3D shapes over it (update()).
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cr-canvas';
    this.canvas.tabIndex = 0;
    this._paint = document.createElement('canvas');
    this.element.appendChild(this.canvas);

    this._keys = new Set();
    this._mouse = { x: 0, y: 0 };
    this.canvas.addEventListener('mousemove', (e) => { this._mouse = this._toUnits(e); });
    this.canvas.addEventListener('click', (e) => {
      this._mouse = this._toUnits(e);
      this.canvas.focus?.();
      this.element.dispatchEvent(new CustomEvent('canvasclick', { detail: { ...this._mouse } }));
    });
    this.canvas.addEventListener('keydown', (e) => {
      const key = keyName(e.key);
      if (SCROLL_KEYS.has(key)) e.preventDefault?.();   // the arrows and Space are the game's
      this._keys.add(key);
      if (!e.repeat) this.element.dispatchEvent(new CustomEvent('canvaskey', { detail: { key } }));
    });
    this.canvas.addEventListener('keyup', (e) => { this._keys.delete(keyName(e.key)); });
    this.canvas.addEventListener('blur', () => { this._keys.clear(); });

    this._autoUpdate = true;
    this._pending = false;
    this._setSize(width, height);
    this._defaults();
    this.clear();
  }

  // ------------------------------------------------------------- settings

  /** The drawing's size, in units. Change it with setSize(). */
  get width() { return this._width; }
  get height() { return this._height; }

  /** Gives the drawing a new size, in units, and erases it. */
  setSize(width, height) {
    this._setSize(width, height);
    this.clear();
    this.layout();
  }

  _setSize(width, height) {
    this._width = checkSide(width, 'width');
    this._height = checkSide(height, 'height');
    for (const c of [this.canvas, this._paint]) {
      c.width = this._width * SCALE;
      c.height = this._height * SCALE;
    }
    // Sizing a canvas resets its context: set it up again.
    this._ctx = this._paint.getContext('2d');
    this._ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    this._ctx.lineJoin = 'round';
    this._ctx.lineCap = 'round';
    this._ctx.textBaseline = 'top';
    this._screen = this.canvas.getContext('2d');
  }

  _defaults() {
    this._background = '#ffffff';
    this._color = '#000000';
    this._lineWidth = 1;
    this._fontSize = 14;
    this._eye = [4, 3, 6];
    this._target = [0, 0, 0];
  }

  /** Puts everything back as new: 400 by 300, white, black lines, the
   *  camera where it starts, nothing drawn, updating by itself. */
  reset() {
    this._autoUpdate = true;
    this._defaults();
    this.setSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  }

  /** The colour clear() fills the drawing with (any CSS colour). */
  get background() { return this._background; }
  set background(color) { this._background = String(color); }

  /** The colour shapes and text are drawn in (any CSS colour). */
  get color() { return this._color; }
  set color(color) { this._color = String(color); }

  /** The width of lines and outlines, in units. */
  get lineWidth() { return this._lineWidth; }
  set lineWidth(value) { this._lineWidth = Math.max(0, Number(value) || 0); }

  /** The height of text, in units. */
  get fontSize() { return this._fontSize; }
  set fontSize(value) { this._fontSize = Math.max(1, Number(value) || 1); }

  // ------------------------------------------------------------------- 2D

  /** Erases the drawing: fills it with the background colour and forgets
   *  the 3D shapes. */
  clear() {
    this._shapes = [];
    const ctx = this._ctx;
    ctx.fillStyle = this._background;
    ctx.fillRect(0, 0, this._width, this._height);
    this._changed();
  }

  /** A dot at (x, y), as wide as lines are (at least one unit). */
  point(x, y) {
    const size = Math.max(1, this._lineWidth);
    this._fill((ctx) => ctx.rect(x - size / 2, y - size / 2, size, size));
  }

  line(x1, y1, x2, y2) {
    this._stroke((ctx) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); });
  }

  /** The outline of a rectangle whose top left corner is (x, y). */
  rect(x, y, width, height) { this._stroke((ctx) => ctx.rect(x, y, width, height)); }

  fillRect(x, y, width, height) { this._fill((ctx) => ctx.rect(x, y, width, height)); }

  /** The outline of a circle centred on (x, y). */
  circle(x, y, radius) { this._stroke((ctx) => ctx.arc(x, y, Math.abs(radius), 0, 2 * Math.PI)); }

  fillCircle(x, y, radius) { this._fill((ctx) => ctx.arc(x, y, Math.abs(radius), 0, 2 * Math.PI)); }

  /** The outline of a closed shape through points, each [x, y]. */
  polygon(points) { this._stroke((ctx) => this._path(ctx, points)); }

  fillPolygon(points) { this._fill((ctx) => this._path(ctx, points)); }

  triangle(x1, y1, x2, y2, x3, y3) { this.polygon([[x1, y1], [x2, y2], [x3, y3]]); }

  fillTriangle(x1, y1, x2, y2, x3, y3) { this.fillPolygon([[x1, y1], [x2, y2], [x3, y3]]); }

  /** Text whose top left corner is (x, y). */
  text(x, y, text) {
    const ctx = this._ctx;
    ctx.fillStyle = this._color;
    ctx.font = `${this._fontSize}px system-ui, sans-serif`;
    ctx.fillText(String(text), x, y);
    this._changed();
  }

  _path(ctx, points) {
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  }

  _stroke(path) {
    const ctx = this._ctx;
    ctx.beginPath();
    path(ctx);
    ctx.strokeStyle = this._color;
    ctx.lineWidth = this._lineWidth;
    ctx.stroke();
    this._changed();
  }

  _fill(path) {
    const ctx = this._ctx;
    ctx.beginPath();
    path(ctx);
    ctx.fillStyle = this._color;
    ctx.fill();
    this._changed();
  }

  // ------------------------------------------------------------------- 3D

  /** Puts the camera at (x, y, z). It looks at the lookAt point. */
  setCamera(x, y, z) {
    this._eye = [x, y, z];
    this._changed();
  }

  /** The point the camera looks at: (0, 0, 0) unless told otherwise. */
  lookAt(x, y, z) {
    this._target = [x, y, z];
    this._changed();
  }

  /**
   * Puts the camera on a circle round the lookAt point: angle degrees
   * round it (0 is in front, on the z side; 90 is to the right), height
   * above it and distance away from it, measured along the ground.
   */
  orbit(angle, height, distance) {
    const a = (angle * Math.PI) / 180;
    const [tx, ty, tz] = this._target;
    this.setCamera(tx + distance * Math.sin(a), ty + height, tz + distance * Math.cos(a));
  }

  line3d(x1, y1, z1, x2, y2, z2) {
    this._shape({ points: [[x1, y1, z1], [x2, y2, z2]], fill: false });
  }

  /** The outline of a triangle in space. */
  triangle3d(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
    this._shape({ points: [[x1, y1, z1], [x2, y2, z2], [x3, y3, z3]], fill: false });
  }

  /** A solid triangle in space, shaded by how it faces the light. */
  fillTriangle3d(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
    this._shape({ points: [[x1, y1, z1], [x2, y2, z2], [x3, y3, z3]], fill: true });
  }

  /** The edges of a box centred on (x, y, z). */
  box3d(x, y, z, width, height, depth) {
    for (const face of this._boxFaces(x, y, z, width, height, depth)) this._shape({ points: face, fill: false });
  }

  /** A solid box centred on (x, y, z), each side shaded by how it faces the light. */
  fillBox3d(x, y, z, width, height, depth) {
    for (const face of this._boxFaces(x, y, z, width, height, depth)) this._shape({ points: face, fill: true });
  }

  _boxFaces(x, y, z, width, height, depth) {
    const [w, h, d] = [width / 2, height / 2, depth / 2];
    const p = (sx, sy, sz) => [x + sx * w, y + sy * h, z + sz * d];
    // Each face's corners go anticlockwise seen from outside.
    return [
      [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)],       // front
      [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)],   // back
      [p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)],       // right
      [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)],   // left
      [p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)],       // top
      [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)],   // bottom
    ];
  }

  _shape({ points, fill }) {
    if (this._shapes.length >= MAX_SHAPES) {
      throw new RangeError(`a canvas keeps at most ${MAX_SHAPES} 3D shapes: clear() it before drawing the next picture`);
    }
    this._shapes.push({ points, fill, color: this._color, lineWidth: this._lineWidth });
    this._changed();
  }

  /** The 3D shapes as they are drawn: farthest first, each with its
   *  points on the drawing ([x, y] in units) and, if solid, its shade (0
   *  dark to 1 fully lit). Shapes that reach behind the camera are left out. */
  _projected() {
    const forward = normalize(sub(this._target, this._eye));
    let right = cross(forward, [0, 1, 0]);
    if (Math.hypot(...right) < 1e-9) right = [1, 0, 0];   // looking straight up or down
    right = normalize(right);
    const up = cross(right, forward);
    const half = this._height / 2;
    const out = [];
    for (const shape of this._shapes) {
      let depth = 0;
      const points = [];
      for (const p of shape.points) {
        const v = sub(p, this._eye);
        const z = dot(v, forward);
        if (z < NEAR) break;
        depth += z;
        points.push([this._width / 2 + (dot(v, right) * FOCAL * half) / z,
          half - (dot(v, up) * FOCAL * half) / z]);
      }
      if (points.length < shape.points.length) continue;
      let shade = 1;
      if (shape.fill) {
        const [a, b, c] = shape.points;
        const normal = normalize(cross(sub(b, a), sub(c, a)));
        shade = 0.45 + 0.55 * Math.abs(dot(normal, LIGHT));
      }
      out.push({ ...shape, points, shade, depth: depth / shape.points.length });
    }
    return out.sort((a, b) => b.depth - a.depth);
  }

  // -------------------------------------------------------------- showing

  /**
   * True if the page shows each change by itself (as it starts). A game
   * that redraws everything many times a second turns this off, so that a
   * half-drawn picture is never seen, and calls update() when each picture
   * is complete.
   */
  get autoUpdate() { return this._autoUpdate; }
  set autoUpdate(value) {
    this._autoUpdate = Boolean(value);
    if (this._autoUpdate) this._changed();
  }

  _changed() {
    if (!this._autoUpdate || this._pending) return;
    const later = globalThis.requestAnimationFrame;
    if (!later) { this.update(); return; }
    this._pending = true;
    later(() => { this._pending = false; if (this._autoUpdate) this.update(); });
  }

  /** Shows the drawing as it is now: the 2D drawing with the 3D shapes over it. */
  update() {
    const ctx = this._screen;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._paint, 0, 0);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const shape of this._projected()) {
      ctx.beginPath();
      shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (shape.points.length > 2) ctx.closePath();
      if (shape.fill) {
        ctx.fillStyle = shape.color;
        ctx.fill();
        ctx.fillStyle = `rgba(0,0,0,${(1 - shape.shade).toFixed(3)})`;   // the shading
        ctx.fill();
      } else {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.lineWidth;
        ctx.stroke();
      }
    }
  }

  // ---------------------------------------------------------------- input

  /** True while the key is held down: 'a', '7', 'Left', 'Right', 'Up',
   *  'Down', 'Space', 'Enter', ... in any case. The canvas hears keys once
   *  it has been clicked. */
  isKeyDown(key) { return this._keys.has(keyName(key)); }

  /** Where the mouse last was over the drawing, in units. */
  get mouseX() { return this._mouse.x; }
  get mouseY() { return this._mouse.y; }

  /** A mouse event's place on the drawing, in units. */
  _toUnits(e) {
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return { x: 0, y: 0 };
    return {
      x: Math.round(((e.clientX - box.left) * this._width) / box.width),
      y: Math.round(((e.clientY - box.top) * this._height) / box.height),
    };
  }

  /** A CanvasPanel holds only its canvas. */
  add() {
    throw new Error('CanvasPanel cannot contain other widgets');
  }

  /** The drawing is as large as fits the panel, keeping its shape, centred. */
  layout() {
    const { width, height } = this.bounds;
    const s = this.canvas.style;
    if (width <= 0 || height <= 0) {       // not placed yet
      s.left = '0'; s.top = '0'; s.width = '100%'; s.height = '100%';
      return;
    }
    const scale = Math.min(width / this._width, height / this._height);
    const w = Math.floor(this._width * scale);
    const h = Math.floor(this._height * scale);
    s.left = `${Math.floor((width - w) / 2)}px`;
    s.top = `${Math.floor((height - h) / 2)}px`;
    s.width = `${w}px`;
    s.height = `${h}px`;
    super.layout();
  }
}
