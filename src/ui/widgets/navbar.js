// Navbar: the singleton navigation strip docked along the top of the
// Viewport (see docs/widgets.txt). A subclass of HPanel.

import { HPanel } from './hpanel.js';

let instance = null;

export const NAVBAR_HEIGHT = 35;

export class Navbar extends HPanel {
  /** The single Navbar, created on first use. */
  static get instance() {
    if (!instance) instance = new Navbar();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('Navbar is a singleton; use Navbar.instance');
    super();
    instance = this;
    this.height = NAVBAR_HEIGHT;
    this.element.classList.add('cr-navbar');
    this.element.setAttribute('role', 'menubar');
    this.element.style.cssText += ';background:var(--cr-nav-bg);color:var(--cr-nav-text);'
      + 'font:var(--cr-font-size-nav) var(--cr-font-ui);z-index:100000;box-shadow:var(--cr-nav-shadow)';
  }

  dispose() {
    super.dispose();
    instance = null;
  }
}
