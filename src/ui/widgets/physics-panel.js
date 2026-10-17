// PhysicsPanel: the output page for physics - a ball that falls under
// gravity and bounces off the sides of the panel (see docs/widgets.txt and
// physics.js). Click to kick the ball away from the click.
//
// The ball is animated only while the page is showing: it pauses when the
// page is hidden or removed from the document, and goes on when it is shown.

import { Panel } from './panel.js';
import { newBall, stepBall, kickBall, atRest } from '../physics.js';

const STYLE = `
.cr-physics-panel{background:var(--cr-output-bg);overflow:hidden;color:var(--cr-text-faint)}
.cr-physics{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:pointer}
`;

function installStyle() {
  if (document.getElementById('cr-physics-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-physics-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class PhysicsPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-physics-panel');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cr-physics';
    this.canvas.setAttribute('aria-label', 'Bouncing ball: click to kick it');
    this.element.appendChild(this.canvas);
    this.ball = newBall();
    this._frame = 0;     // the pending animation frame, 0 for none
    this._last = 0;      // the time of the last frame
    this._width = 0;
    this._height = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.kick(e.clientX - rect.left, e.clientY - rect.top);
    });
  }

  /** The world the ball is in: the size of the panel, in pixels. */
  get world() { return { width: this._width, height: this._height }; }

  /** True while the page can be seen, which is when the ball moves. */
  get running() {
    return this.visible && this.element.isConnected && this._width > 0 && this._height > 0;
  }

  /** Kicks the ball away from the point (x, y of the panel). */
  kick(x, y) {
    this.ball = kickBall(this.ball, { x, y });
    this._start();
  }

  /** Puts the ball back at the top left, moving to the right. */
  clear() {
    this.ball = newBall();
    this._draw();
    this._start();
  }

  /** A PhysicsPanel holds only its canvas. */
  add() {
    throw new Error('PhysicsPanel cannot contain other widgets');
  }

  get visible() { return super.visible; }
  set visible(value) {
    super.visible = value;
    if (this.visible) this._start();
  }

  layout() {
    const { width, height } = this.bounds;
    this._width = width;
    this._height = height;
    const ratio = globalThis.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.ball = stepBall(this.ball, 0, this.world);   // keep the ball inside a smaller panel
    this._draw();
    this._start();
    super.layout();
  }

  // Starts the animation if it is not going and the page is showing.
  _start() {
    const later = globalThis.requestAnimationFrame;
    if (this._frame || !later || !this.running) return;
    this._last = 0;
    this._frame = later((t) => this._tick(t));
  }

  _tick(time) {
    this._frame = 0;
    if (!this.running) return;                 // paused: _start() goes on when it is shown
    const dt = this._last ? (time - this._last) / 1000 : 0;
    this._last = time;
    this.ball = stepBall(this.ball, dt, this.world);
    this._draw();
    if (atRest(this.ball, this.world) && Math.abs(this.ball.vx) < 1) return;   // nothing moves until kicked
    this._frame = globalThis.requestAnimationFrame((t) => this._tick(t));
  }

  _draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const ratio = this.canvas.width / Math.max(1, this._width);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this._width, this._height);
    const { x, y, r } = this.ball;
    // The shadow on the floor shrinks as the ball rises.
    const height = Math.max(0, Math.min(1, (this._height - r - y) / Math.max(1, this._height)));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, this._height - 4, r * (1 - 0.6 * height), r * 0.22 * (1 - 0.6 * height), 0, 0, Math.PI * 2);
    ctx.fill();
    const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    shine.addColorStop(0, '#ffb86b');
    shine.addColorStop(1, '#e8590c');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = getComputedStyle(this.element).color;
    ctx.font = '11px sans-serif';
    ctx.fillText('Click to kick the ball', 8, 16);
  }
}
