// Viewport: the singleton outermost container that fills the browser window
// (see docs/widgets.txt).

import { Panel } from './panel.js';

let instance = null;

export class Viewport extends Panel {
  /** The single Viewport, created on first use. */
  static get instance() {
    if (!instance) instance = new Viewport();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('Viewport is a singleton; use Viewport.instance');
    super();
    instance = this;
    this.element.classList.add('cr-viewport');
    const s = this.element.style;
    s.position = 'fixed';
    s.inset = '0';
    s.overflow = 'hidden';
    this._onResize = () => this.layout();
  }

  /** Attaches the Viewport to the page and starts tracking window size. */
  mount(host = document.body) {
    host.appendChild(this.element);
    window.addEventListener('resize', this._onResize);
    this.layout();
    return this;
  }

  /** The Navbar docked at the top of the Viewport, or null. */
  get navbar() { return this._navbar ?? null; }
  set navbar(bar) {
    if (this._navbar) this.remove(this._navbar);
    this._navbar = bar ?? null;
    if (bar) {
      this.add(bar);
      this.element.insertBefore(bar.element, this.element.firstChild);
    }
    this.layout();
  }

  /** Height taken by the Navbar; content and windows start below it. */
  get top() { return this._navbar && this._navbar.visible ? this._navbar.height : 0; }

  /** The StatusBar docked at the bottom of the Viewport, or null. */
  get statusBar() { return this._statusBar ?? null; }
  set statusBar(bar) {
    if (this._statusBar) this.remove(this._statusBar);
    this._statusBar = bar ?? null;
    if (bar) this.add(bar);
    this.layout();
  }

  /** Height taken by the StatusBar; windows cannot be dragged below it. */
  get bottom() { return this._statusBar && this._statusBar.visible ? this._statusBar.height : 0; }

  /** Open windows (children with a title bar), back to front. */
  get windows() {
    return this._children
      .filter((c) => typeof c.bringToFront === 'function')
      .sort((a, b) => (Number(a.element.style.zIndex) || 0) - (Number(b.element.style.zIndex) || 0));
  }

  /** Windows that are minimized, oldest first. */
  get minimizedWindows() {
    return this._children.filter((c) => c.minimized === true);
  }

  // ------------------------------------------------------ window commands

  /** Windows currently showing (not minimized or hidden), back to front. */
  get visibleWindows() { return this.windows.filter((w) => w.visible); }

  /**
   * Tiles the showing windows in a grid over the area between the Navbar and
   * the StatusBar, front-most window first (top left). Maximized windows are
   * restored first. Windows keep their minimum size, so with many windows
   * in a small viewport some may overlap.
   */
  arrangeWindows() {
    const wins = this.visibleWindows.reverse();
    if (wins.length === 0) return;
    const top = this.top;
    const width = this.width;
    const height = this.height - top - this.bottom;
    const cols = Math.ceil(Math.sqrt(wins.length * (width / Math.max(1, height)) * 0.75));
    const columns = Math.max(1, Math.min(wins.length, cols));
    const rows = Math.ceil(wins.length / columns);
    wins.forEach((win, i) => {
      const row = Math.floor(i / columns);
      // The last row may be short; its windows share the full width.
      const inRow = row === rows - 1 ? wins.length - row * columns : columns;
      const col = i - row * columns;
      const x0 = Math.round((col * width) / inRow);
      const x1 = Math.round(((col + 1) * width) / inRow);
      const y0 = top + Math.round((row * height) / rows);
      const y1 = top + Math.round(((row + 1) * height) / rows);
      if (win.maximized) win.restore();
      win.setBounds(x0, y0, x1 - x0, y1 - y0);
    });
  }

  /** Minimizes every showing window. */
  minimizeAll() {
    for (const win of this.visibleWindows) win.minimize();
  }

  /** Brings back every minimized window and un-maximizes maximized ones. */
  restoreAll() {
    for (const win of this.minimizedWindows) win.open(this);
    for (const win of this.windows) if (win.maximized) win.restore();
  }

  /** Closes every window. A window whose close event is cancelled stays open. */
  closeAll() {
    for (const win of this.windows) win.close();
  }

  layout() {
    if (this._navbar) this._navbar.setBounds(0, 0, this.width, this._navbar.height);
    for (const win of this.windows) if (win.maximized) win.fitToParent();
    if (this._statusBar) {
      const h = this._statusBar.height;
      this._statusBar.setBounds(0, this.height - h, this.width, h);
    }
    super.layout();
  }

  get width() { return this.element.clientWidth; }
  get height() { return this.element.clientHeight; }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    super.dispose();
    instance = null;
  }
}
