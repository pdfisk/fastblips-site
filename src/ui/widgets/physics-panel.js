// PhysicsPanel: the output page for physics - the Physics class's world, with
// its shapes falling, bouncing and spinning (see docs/widgets.txt and
// ../physics.js, the engine).
//
// The world has a size of its own in units (400 by 300 unless setSize says
// otherwise), with (0, 0) at the top left, and is scaled to fit the panel,
// keeping its shape, as the Canvas is. Until a program makes its Physics the
// page shows a demo ball: click to kick it.
//
// A group (a composite of several shapes) is drawn part by part, each at its
// place in the world, so the group moves, turns and grows as one.
//
// The world is animated only while the page is showing: it pauses when the
// page is hidden or removed from the document, and goes on when it is shown.
// When every shape has come to rest nothing is animated at all.

import { Panel } from './panel.js';
import { PhysicsWorld } from '../physics.js';

const STYLE = `
.cr-physics-panel{background:var(--cr-output-bg);overflow:hidden;color:var(--cr-text-faint)}
.cr-physics{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:crosshair}
`;

function installStyle() {
  if (document.getElementById('cr-physics-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-physics-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const MAX_FRAME = 0.05;   // seconds: the longest time a frame moves the world on

export class PhysicsPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-physics-panel');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cr-physics';
    this.canvas.setAttribute('aria-label', 'Physics: shapes that fall and bounce');
    this.element.appendChild(this.canvas);
    this.world = new PhysicsWorld();
    this.world.onChange = () => this._changed();
    this.demo = true;        // showing the demo ball, not a program's world
    this._frame = 0;         // the pending animation frame, 0 for none
    this._last = 0;          // the time of the last frame
    this._width = 0;
    this._height = 0;
    this._addDemo();
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const { x, y } = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (this.demo) this.world.kick(x, y);
      this.element.dispatchEvent(new CustomEvent('physicsclick', { detail: { x: Math.round(x), y: Math.round(y) } }));
    });
  }

  _addDemo() {
    const id = this.world.addBall(28, 28, 14);
    this.world.setVelocity(id, 180, 0);
  }

  /** True while the page can be seen, which is when the world moves. */
  get running() {
    return this.visible && this.element.isConnected && this._width > 0 && this._height > 0;
  }

  /** A program made its Physics: the world is its own, new and empty. */
  startProgram() {
    this.demo = false;
    this.world.reset();
  }

  /** Before each run: the world as new again, with the demo ball. */
  reset() {
    this.demo = true;
    this.world.reset();
    this._addDemo();
  }

  /** Removes every shape (Clear Output); the world keeps its size, gravity and handlers. */
  clear() {
    this.world.clear();
  }

  /** A point of the panel (pixels) as a point of the world (units). */
  toWorld(px, py) {
    const { scale, left, top } = this._fit();
    return { x: (px - left) / scale, y: (py - top) / scale };
  }

  /** A PhysicsPanel holds only its canvas. */
  add() {
    throw new Error('PhysicsPanel cannot contain other widgets');
  }

  get visible() { return super.visible; }
  set visible(value) {
    super.visible = value;
    if (this.visible) this._changed();
  }

  layout() {
    const { width, height } = this.bounds;
    this._width = width;
    this._height = height;
    const ratio = globalThis.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this._draw();
    this._changed();
    super.layout();
  }

  // The world is as large as fits the panel, keeping its shape, centred.
  _fit() {
    const scale = Math.min(this._width / this.world.width, this._height / this.world.height) || 1;
    return {
      scale,
      left: (this._width - this.world.width * scale) / 2,
      top: (this._height - this.world.height * scale) / 2,
    };
  }

  // Something changed: draw it, and start the animation if the world is moving.
  _changed() {
    const later = globalThis.requestAnimationFrame;
    if (this._frame || !later || !this.running) return;
    this._last = 0;
    this._frame = later((t) => this._tick(t));
  }

  _tick(time) {
    this._frame = 0;
    if (!this.running) return;                 // paused: _changed() goes on when it is shown
    const dt = this._last ? Math.min((time - this._last) / 1000, MAX_FRAME) : 0;
    this._last = time;
    this.world.step(dt);
    this._draw();
    if (!this.world.sleeping && !this.world.paused) {
      this._frame = globalThis.requestAnimationFrame((t) => this._tick(t));
    }
  }

  _draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || this._width <= 0) return;
    const ratio = this.canvas.width / this._width;
    const { world } = this;
    const { scale, left, top } = this._fit();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this._width, this._height);
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * left, ratio * top);
    ctx.fillStyle = world.background;
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, world.width, world.height);
    ctx.clip();
    for (const body of world.bodies.values()) for (const part of body.parts) this._drawPart(ctx, part);
    ctx.restore();
    if (this.demo) {
      ctx.fillStyle = '#868e96';
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('Click to kick the ball', 8, 6);
    }
    for (const part of world.parts.values()) {
      if (!part.label) continue;
      ctx.fillStyle = '#111';
      ctx.font = `${Math.max(8, Math.min(16, part.radius * 0.7))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(part.label, part.x, part.y);
      ctx.textAlign = 'start';
    }
  }

  // One shape, at its place in the world: in a group, a part moves and turns with the group.
  _drawPart(ctx, part) {
    ctx.save();
    ctx.translate(part.x, part.y);
    ctx.rotate(part.angle);
    ctx.fillStyle = part.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    switch (part.shape) {
      case 'circle':
      case 'ball':
        ctx.arc(0, 0, part.radius, 0, Math.PI * 2);
        break;
      case 'ellipse': {
        const verts = part.collider.verts;
        const rx = Math.max(...verts.map((v) => v[0]));
        const ry = Math.max(...verts.map((v) => v[1]));
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        break;
      }
      default:
        part.collider.verts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
    }
    ctx.fill();
    if (part.shape === 'ball') {
      // A sphere: a light spot that stays put, and a dot that turns with the ball.
      ctx.save();
      ctx.rotate(-part.angle);
      const g = ctx.createRadialGradient(-part.radius * 0.35, -part.radius * 0.35, part.radius * 0.1, 0, 0, part.radius);
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, part.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(part.radius * 0.55, 0, Math.max(1.5, part.radius * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    switch (part.shape) {
      case 'circle':
        ctx.arc(0, 0, part.radius, 0, Math.PI * 2);
        ctx.moveTo(0, 0);
        ctx.lineTo(part.radius, 0);          // a spoke, to show how it turns
        break;
      case 'ball':
        ctx.arc(0, 0, part.radius, 0, Math.PI * 2);
        break;
      case 'ellipse': {
        const verts = part.collider.verts;
        ctx.ellipse(0, 0, Math.max(...verts.map((v) => v[0])), Math.max(...verts.map((v) => v[1])), 0, 0, Math.PI * 2);
        break;
      }
      default:
        part.collider.verts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
  }
}
