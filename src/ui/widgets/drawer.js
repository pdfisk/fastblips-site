// Drawer: a panel that slides in over the page from one of its edges, with a
// dimmed page behind it (see docs/widgets.txt). Modelled on qooxdoo mobile's
// qx.ui.mobile.container.Drawer: the menu that comes out of the side of a phone
// app.
//
// The Drawer covers the whole area of the container it is in (give it fill(),
// or put it in a container whose layout lets it fill: it is made to fill the
// screen). Closed, it is out of sight, takes no clicks (its pointer-events:none
// is !important, as a program's widgets are given an inline pointer-events:auto,
// which would otherwise let the closed drawer catch every tap on the page), and
// its children are inert. Open, a panel panelSize pixels wide (high, for the top and bottom)
// has slid in from `side`, the rest of the area is dimmed, and a tap on the
// dimmed part closes it unless dismissOnTap is false. A swipe on the panel
// toward its edge, and Escape, also close it. The panel holds children placed
// by a layout manager, as a Composite's are: the default is vbox.
//
// A change of state fires a change event with detail { open }, whoever made it.

import { Composite } from './composite.js';
import { Widget } from './widget.js';

export const SIDES = Object.freeze(['left', 'right', 'top', 'bottom']);

/** The size of the panel, in pixels, until it is set. */
export const DEFAULT_PANEL_SIZE = 260;

/** How far the panel must be swiped toward its edge to close, in pixels. */
export const SWIPE_DISTANCE = 50;

const STYLE = `
.cr-drawer{z-index:10;overflow:hidden;pointer-events:none !important}
.cr-drawer-scrim{position:absolute;inset:0;background:rgba(0,0,0,.4);opacity:0;pointer-events:none;
  transition:opacity .25s ease}
.cr-drawer-panel{position:absolute;box-sizing:border-box;overflow:hidden;pointer-events:none;
  background:var(--cr-window-bg);color:var(--cr-text);box-shadow:var(--cr-menu-shadow);
  transition:transform .25s ease;touch-action:pan-y}
.cr-drawer-open .cr-drawer-scrim{opacity:1;pointer-events:auto}
.cr-drawer-open .cr-drawer-panel{pointer-events:auto}
.cr-drawer-left .cr-drawer-panel{left:0;top:0;bottom:0;transform:translateX(-100%)}
.cr-drawer-right .cr-drawer-panel{right:0;top:0;bottom:0;transform:translateX(100%)}
.cr-drawer-top .cr-drawer-panel{left:0;right:0;top:0;transform:translateY(-100%)}
.cr-drawer-bottom .cr-drawer-panel{left:0;right:0;bottom:0;transform:translateY(100%)}
.cr-drawer-open .cr-drawer-panel{transform:none}
.cr-drawer-panel:focus{outline:0}
`;

function installStyle() {
  if (document.getElementById('cr-drawer-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-drawer-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class Drawer extends Composite {
  /** @param {{side?: 'left'|'right'|'top'|'bottom'}} [options] */
  constructor({ side = 'left' } = {}) {
    super({ layout: 'vbox' });
    installStyle();
    this.element.classList.add('cr-drawer');
    this._side = 'left';
    this._panelSize = DEFAULT_PANEL_SIZE;
    this._open = false;
    this._dismissOnTap = true;
    this.scrim = document.createElement('div');
    this.scrim.className = 'cr-drawer-scrim';
    this.panel = document.createElement('div');
    this.panel.className = 'cr-drawer-panel';
    this.panel.tabIndex = -1;   // focused when it opens, so Escape reaches it
    this.element.appendChild(this.scrim);
    this.element.appendChild(this.panel);
    this.scrim.addEventListener('click', () => { if (this._dismissOnTap) this.open = false; });
    this.element.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._open) this.open = false; });
    this.panel.addEventListener('pointerdown', (e) => { this._swipe = { x: e.clientX, y: e.clientY }; });
    this.panel.addEventListener('pointerup', (e) => this._swiped(e));
    this.panel.addEventListener('pointercancel', () => { this._swipe = null; });
    this.side = side;
    this._syncContent();
  }

  /** Which edge the panel comes in from: one of SIDES. */
  get side() { return this._side; }
  set side(value) {
    const side = String(value).trim().toLowerCase();
    if (!SIDES.includes(side)) throw new Error(`a side must be one of ${SIDES.join(', ')}, not '${value}'`);
    for (const s of SIDES) this.element.classList.remove(`cr-drawer-${s}`);
    this._side = side;
    this.element.classList.add(`cr-drawer-${side}`);
    this.layout();
  }

  /** How wide the panel is (how high, for the top and bottom), in pixels. It is never more than the area. */
  get panelSize() { return this._panelSize; }
  set panelSize(value) {
    this._panelSize = Math.max(0, Math.round(Number(value) || 0));
    this.layout();
  }

  /** True when the panel is in. */
  get open() { return this._open; }
  set open(value) {
    const next = Boolean(value);
    if (next === this._open) return;
    this._open = next;
    this.element.classList.toggle('cr-drawer-open', next);
    this._syncContent();
    // Open, the panel takes the focus, so the keyboard (Escape) works in it at once.
    if (next) this.panel.focus?.({ preventScroll: true });
    this.element.dispatchEvent(new CustomEvent('change', { detail: { open: next } }));
  }

  /** Opens it if it is closed, closes it if it is open. */
  toggle() { this.open = !this._open; }

  /** Whether a tap on the dimmed page behind the panel closes it. */
  get dismissOnTap() { return this._dismissOnTap; }
  set dismissOnTap(value) { this._dismissOnTap = Boolean(value); }

  // Closed, the children cannot be reached by the keyboard or a screen reader.
  _syncContent() {
    for (const child of this._children) child.element.inert = !this._open;
  }

  // The children go in the panel, not on the drawer's own element.
  add(child) {
    if (!(child instanceof Widget)) throw new TypeError('Panel children must be Widgets');
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this._children.push(child);
    this.panel.appendChild(child.element);
    child.element.inert = !this._open;
    return child;
  }

  remove(child) {
    super.remove(child);
    child.element.inert = false;
  }

  // A swipe on the panel toward its edge closes it.
  _swiped(e) {
    const start = this._swipe;
    this._swipe = null;
    if (!start || !this._open) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const toward = { left: -dx, right: dx, top: -dy, bottom: dy }[this._side];
    const across = this._side === 'left' || this._side === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (toward >= SWIPE_DISTANCE && toward > across) this.open = false;
  }

  layout() {
    if (!this.panel) return;     // the Composite's constructor lays out before the panel is made
    const horizontal = this._side === 'left' || this._side === 'right';
    const width = this.innerWidth;
    const height = this.innerHeight;
    const size = Math.min(this._panelSize, horizontal ? width : height);
    const panelWidth = horizontal ? size : width;
    const panelHeight = horizontal ? height : size;
    this.panel.style.width = `${panelWidth}px`;
    this.panel.style.height = `${panelHeight}px`;
    // The layout places the children in the panel, not in the whole area.
    this._manager.apply({ children: this.children, padding: this.padding, innerWidth: panelWidth, innerHeight: panelHeight });
    for (const child of this._children) child.layout();
  }
}
