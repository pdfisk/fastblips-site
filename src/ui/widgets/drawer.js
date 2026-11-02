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
// has slid in from `side` and the rest of the area is dimmed. The user closes
// it in only two ways: a tap on the dimmed part outside the panel (unless
// dismissOnTap is false), or leaving it alone for the drawer timeout
// (Settings > Drawer Time, 5 seconds at first; any use of the panel starts the
// wait again). A program can still close it with open = false. The panel
// holds children placed by a layout manager, as a Composite's are: the
// default is vbox.
//
// A change of state fires a change event with detail { open }, whoever made it.

import { Composite } from './composite.js';
import { Widget } from './widget.js';

export const SIDES = Object.freeze(['left', 'right', 'top', 'bottom']);

/** The size of the panel, in pixels, until it is set. */
export const DEFAULT_PANEL_SIZE = 260;

// ---- the drawer timeout (Settings > Drawer Time) ----

/** The choices in Settings > Drawer Time, in milliseconds; 0 is never. */
export const DRAWER_TIMEOUTS = Object.freeze([0, 3000, 5000, 10000, 30000]);

/** How long an open drawer waits, unused, before it closes, until it is set. */
export const DEFAULT_DRAWER_TIMEOUT = 5000;

const TIMEOUT_KEY = 'crumb.drawerTimeout';
let drawerTimeoutMs = null;   // set by setDrawerTimeout() on this page

/** How long an open drawer stays without being used before it closes, in milliseconds (0: it stays). */
export function drawerTimeout() {
  if (drawerTimeoutMs !== null) return drawerTimeoutMs;
  try {
    const saved = globalThis.localStorage?.getItem(TIMEOUT_KEY);
    const value = saved == null || saved === '' ? NaN : Number(saved);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch { /* storage blocked */ }
  return DEFAULT_DRAWER_TIMEOUT;
}

/** Chooses the drawer timeout (milliseconds, 0 for never) and remembers it for the next visit. */
export function setDrawerTimeout(ms) {
  ms = Number(ms);
  if (!Number.isFinite(ms) || ms < 0) throw new Error('a drawer timeout is a number of milliseconds, 0 or more');
  drawerTimeoutMs = ms;
  try { globalThis.localStorage?.setItem(TIMEOUT_KEY, String(ms)); } catch { /* not remembered */ }
}

/** A drawer timeout as the Settings menu shows it: 5000 is "5 seconds", 0 is "Never". */
export function drawerTimeoutLabel(ms) {
  if (!ms) return 'Never';
  const seconds = ms / 1000;
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

// What counts as using the open panel: each starts the timeout again.
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input', 'focusin'];

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
    this._timeout = null;    // null: the Settings value
    this._timer = null;
    this.scrim = document.createElement('div');
    this.scrim.className = 'cr-drawer-scrim';
    this.panel = document.createElement('div');
    this.panel.className = 'cr-drawer-panel';
    this.panel.tabIndex = -1;   // focused when it opens, so Escape reaches it
    this.element.appendChild(this.scrim);
    this.element.appendChild(this.panel);
    // A tap outside the panel (on the dimmed page) closes it.
    this.scrim.addEventListener('click', () => { if (this._dismissOnTap) this.open = false; });
    // Using the panel keeps it open: the timeout starts again.
    for (const type of ACTIVITY) this.panel.addEventListener(type, () => { if (this._open) this._startTimer(); });
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
    // Open, the panel takes the focus, so the keyboard works in it at once.
    if (next) this.panel.focus?.({ preventScroll: true });
    if (next) this._startTimer(); else this._stopTimer();
    this.element.dispatchEvent(new CustomEvent('change', { detail: { open: next } }));
  }

  /** Opens it if it is closed, closes it if it is open. */
  toggle() { this.open = !this._open; }

  /** Whether a tap on the dimmed page behind the panel closes it. */
  get dismissOnTap() { return this._dismissOnTap; }
  set dismissOnTap(value) { this._dismissOnTap = Boolean(value); }

  /**
   * How long this drawer stays open without being used, in milliseconds (0:
   * until a tap outside), or null (the default) to follow Settings > Drawer
   * Time. The designer sets 0, so a drawer opened to be designed stays open.
   */
  get timeout() { return this._timeout; }
  set timeout(value) {
    this._timeout = value == null ? null : Math.max(0, Number(value) || 0);
    if (this._open) this._startTimer();
  }

  /** The timeout in force: this drawer's own, else the Settings value. */
  get effectiveTimeout() { return this._timeout ?? drawerTimeout(); }

  _startTimer() {
    this._stopTimer();
    const ms = this.effectiveTimeout;
    if (!ms) return;
    this._timer = setTimeout(() => { this._timer = null; this.open = false; }, ms);
    this._timer?.unref?.();   // under Node (tests), a waiting drawer keeps nothing running
  }

  _stopTimer() {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
  }

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
