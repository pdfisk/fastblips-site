// Carousel: pages side by side that the user swipes between, with a row of
// dots saying which one is showing (see docs/widgets.txt). Modelled on
// qooxdoo mobile's qx.ui.mobile.container.Carousel.
//
// Each child is a page and fills the Carousel. The page showing is selected;
// the others wait to its left and right, out of sight, and are inert (they take
// neither clicks nor the keyboard). Dragging sideways with a finger or the
// mouse moves the pages with it and, on letting go, goes to the next or
// previous page if it was dragged far enough or flicked, else back. At either
// end the pages resist. The dots can be tapped. Pages do not wrap round.
//
// select(i), selectNext() and selectPrevious() change the page; each change
// fires a select event with detail { index }, whoever made it.

import { Panel } from './panel.js';

const STYLE = `
.cr-carousel{overflow:hidden;touch-action:pan-y}
.cr-carousel>.cr-widget{transition:left .25s ease}
.cr-carousel.cr-dragging>.cr-widget{transition:none}
.cr-carousel-dots{position:absolute;left:0;right:0;bottom:6px;z-index:1;display:flex;justify-content:center;
  gap:8px;pointer-events:none}
.cr-carousel-dot{pointer-events:auto;width:10px;height:10px;padding:0;border-radius:50%;
  border:1px solid var(--cr-text-faint);background:transparent;cursor:pointer}
.cr-carousel-dot.cr-carousel-dot-on{background:var(--cr-accent);border-color:var(--cr-accent)}
`;

function installStyle() {
  if (document.getElementById('cr-carousel-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-carousel-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** How far a pointer must move sideways before it is a drag, in pixels. */
export const DRAG_THRESHOLD = 10;

/** The part of the width a drag must cover to turn the page, or the speed (pixels a millisecond) of a flick. */
export const TURN_FRACTION = 0.2;
export const FLICK_SPEED = 0.5;

export class Carousel extends Panel {
  /** @param {{dots?: boolean}} [options] - whether the row of dots shows */
  constructor({ dots = true } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-carousel');
    this._selected = -1;
    this._dots = Boolean(dots);
    this._drag = 0;                 // how far the pages are dragged now, in pixels
    this._pointer = null;           // the pointer that is down: { id, x, y, time, dragging }
    this.dotsElement = document.createElement('div');
    this.dotsElement.className = 'cr-carousel-dots';
    this.element.appendChild(this.dotsElement);
    this.element.addEventListener('pointerdown', (e) => this._down(e));
    this.element.addEventListener('pointermove', (e) => this._move(e));
    this.element.addEventListener('pointerup', (e) => this._up(e));
    this.element.addEventListener('pointercancel', (e) => this._up(e, true));
    // A drag must not end as a click on the page it started on.
    this.element.addEventListener('click', (e) => {
      if (!this._swallowClick) return;
      this._swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    this._renderDots();
  }

  /** Whether the row of dots shows (it never does with fewer than two pages). */
  get dots() { return this._dots; }
  set dots(value) { this._dots = Boolean(value); this._renderDots(); }

  /** Index of the page showing (-1 if there are none). */
  get selectedIndex() { return this._selected; }

  /** The page showing, or null. */
  get selectedWidget() { return this._children[this._selected] ?? null; }

  /** Adds a page after the others; the first page added is showing. */
  add(child) {
    super.add(child);
    if (this._selected < 0) this._choose(0);
    this._renderDots();
    this.layout();
    return child;
  }

  remove(child) {
    const index = this._children.indexOf(child);
    super.remove(child);
    if (index < 0) return;
    child.element.inert = false;
    if (this._children.length === 0) {
      this._choose(-1);
    } else if (index < this._selected) {
      this._selected -= 1;
    } else if (index === this._selected) {
      this._choose(Math.min(index, this._children.length - 1), true);
    }
    this._renderDots();
    this.layout();
  }

  /** Shows the page at index. */
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._children.length) return;
    this._choose(index);
    this._renderDots();
    this.layout();
  }

  /** Shows the next page; at the last page it does nothing. */
  selectNext() { this.select(this._selected + 1); }

  /** Shows the previous page; at the first page it does nothing. */
  selectPrevious() { this.select(this._selected - 1); }

  // Makes the choice and says so. `force` fires the event for the same index.
  _choose(index, force = false) {
    if (index === this._selected && !force) return;
    this._selected = index;
    this.element.dispatchEvent(new CustomEvent('select', { detail: { index, widget: this.selectedWidget } }));
  }

  // One dot a page, the one showing filled; a tap on a dot shows that page.
  _renderDots() {
    this.dotsElement.hidden = !this._dots || this._children.length < 2;
    this.dotsElement.replaceChildren(...this._children.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `cr-carousel-dot${i === this._selected ? ' cr-carousel-dot-on' : ''}`;
      dot.setAttribute('aria-label', `Page ${i + 1}`);
      dot.addEventListener('click', () => this.select(i));
      return dot;
    }));
  }

  // ---- dragging

  _down(e) {
    if (this._pointer || (e.button !== undefined && e.button > 0)) return;
    this._pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp ?? 0, dragging: false };
  }

  _move(e) {
    const p = this._pointer;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      // Only a mostly sideways move is a drag: the rest is the page's own (scrolling).
      if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
      p.dragging = true;
      this.element.classList.add('cr-dragging');
      this.element.setPointerCapture?.(p.id);
    }
    const atEdge = (dx > 0 && this._selected <= 0) || (dx < 0 && this._selected >= this._children.length - 1);
    this._drag = atEdge ? dx / 3 : dx;
    this.layout();
  }

  _up(e, cancelled = false) {
    const p = this._pointer;
    if (!p || e.pointerId !== p.id) return;
    this._pointer = null;
    if (!p.dragging) return;
    const dx = e.clientX - p.x;
    const elapsed = Math.max(1, (e.timeStamp ?? 0) - p.time);
    const far = Math.abs(dx) > this.innerWidth * TURN_FRACTION;
    const flick = Math.abs(dx) / elapsed > FLICK_SPEED && Math.abs(dx) > DRAG_THRESHOLD;
    this._drag = 0;
    this.element.classList.remove('cr-dragging');
    this._swallowClick = true;
    setTimeout(() => { this._swallowClick = false; }, 0);
    if (!cancelled && (far || flick)) {
      if (dx < 0) this.selectNext(); else this.selectPrevious();
    }
    this.layout();
  }

  layout() {
    const width = this.innerWidth;
    const height = this.innerHeight;
    this._children.forEach((child, i) => {
      child.setBounds((i - this._selected) * width + this._drag, 0, width, height);
      child.element.inert = i !== this._selected;
    });
    super.layout();
  }
}
