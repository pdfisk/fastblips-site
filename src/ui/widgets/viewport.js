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

  /** Open windows (children with a title bar), back to front. */
  get windows() {
    return this._children
      .filter((c) => typeof c.bringToFront === 'function')
      .sort((a, b) => (Number(a.element.style.zIndex) || 0) - (Number(b.element.style.zIndex) || 0));
  }

  layout() {
    if (this._navbar) this._navbar.setBounds(0, 0, this.width, this._navbar.height);
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
