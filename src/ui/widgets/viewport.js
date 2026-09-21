// Viewport: the singleton outermost container that fills the browser window
// (see docs/widgets.txt).

import { Panel } from './panel.js';
import { installTheme } from '../theme.js';

let instance = null;

/** Arrange Windows: each window's share of the viewport's width and height. */
export const CASCADE_SIZE = 0.35;
/** Arrange Windows: the diagonal offset between one window and the next. */
export const CASCADE_STEP = 30;

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
    s.background = 'var(--cr-desktop-bg)';
    s.color = 'var(--cr-text)';
    this._onResize = () => this.layout();
  }

  /** Attaches the Viewport to the page and starts tracking window size. */
  mount(host = document.body) {
    installTheme();
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
   * Cascades the showing windows diagonally from the top left, below the
   * Navbar. Each is sized to CASCADE_SIZE of the space between the Navbar
   * and the StatusBar (at least its minimum size), and each sits
   * CASCADE_STEP pixels right of and below the one behind it, so the
   * front-most window ends up last and on top. When the next window would
   * run off the bottom or right, the diagonal starts again at the top, one
   * step further right. Maximized windows are restored first.
   */
  arrangeWindows() {
    const wins = this.visibleWindows;   // back to front
    if (wins.length === 0) return;
    const top = this.top;
    const areaW = this.width;
    const areaH = this.height - top - this.bottom;
    let x = 0;
    let y = top;
    let column = 0;
    for (const win of wins) {
      if (win.maximized) win.restore();
      const w = Math.max(win.minWidth, Math.round(areaW * CASCADE_SIZE));
      const h = Math.max(win.minHeight, Math.round(areaH * CASCADE_SIZE));
      if (y + h > top + areaH || x + w > areaW) {
        column += 1;
        x = (column * CASCADE_STEP) % Math.max(CASCADE_STEP, areaW - w);
        y = top;
      }
      win.setBounds(x, y, w, h);
      x += CASCADE_STEP;
      y += CASCADE_STEP;
    }
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
