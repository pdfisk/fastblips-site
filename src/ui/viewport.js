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

  get width() { return this.element.clientWidth; }
  get height() { return this.element.clientHeight; }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    super.dispose();
    instance = null;
  }
}
