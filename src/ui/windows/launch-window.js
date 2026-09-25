// LaunchWindow: a window that runs a console's program as an app, opened
// from the console's Launch menu. Abstract: DesktopLaunchWindow is an
// ordinary resizable window, MobileLaunchWindow is the size of a phone
// screen and cannot be resized (see docs/widgets.txt).

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { TextPanel } from '../widgets/text-panel.js';

// The app's screen: a TextPanel filling all of it.
class ScreenPanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-launch-screen');
    this.element.style.background = 'var(--cr-output-bg)';
    this.textPanel = this.add(new TextPanel());
  }

  layout() {
    this.textPanel.setBounds(0, 0, this.bounds.width, this.bounds.height);
    super.layout();
  }
}

// Every launch window, of either kind, cascades from the same point.
let opened = 0;

export class LaunchWindow extends Window {
  /** The kind of launch: 'Desktop' or 'Mobile'. */
  static get kind() { return 'Launch'; }

  /**
   * @param {object} options - Window options, plus `source` (the program)
   *   and `console` (the ConsoleWindow it was launched from). The title
   *   is the name of the console's script.
   */
  constructor({ source = '', console = null, ...options } = {}) {
    if (new.target === LaunchWindow) {
      throw new TypeError('LaunchWindow is abstract; use DesktopLaunchWindow or MobileLaunchWindow');
    }
    const kind = new.target.kind;
    const offset = (opened++ % 8) * 24;
    super({
      title: console ? console.scriptName : kind,
      x: 480 + offset, y: 70 + offset,
      ...options,
    });
    this.element.classList.add('cr-launch-window');
    this.source = source;
    this.console = console;
    this.screen = new ScreenPanel();
    this.textPanel = this.screen.textPanel;
    this.content = this.screen;
    this.goButton = this.buttonBar.addButton('Go', () => this.go());
    this.resetButton = this.buttonBar.addButton('Reset', () => this.reset());
  }

  /** Starts the app (the Go button). Not implemented yet: does nothing. */
  go() {
    return null;
  }

  /** Puts the app back to its starting state (the Reset button). Not
   *  implemented yet: does nothing. */
  reset() {}
}

export class DesktopLaunchWindow extends LaunchWindow {
  static get kind() { return 'Desktop'; }

  constructor(options = {}) {
    super({ width: 640, height: 440, ...options });
    this.element.classList.add('cr-desktop-launch-window');
  }
}

export class MobileLaunchWindow extends LaunchWindow {
  static get kind() { return 'Mobile'; }

  /** The phone screen: the size of the content area, in CSS pixels. */
  static get screenSize() { return { width: 360, height: 640 }; }

  constructor(options = {}) {
    const { width, height } = new.target.screenSize;
    // Roughly the window's size; open() makes the content area exact.
    super({ width: width + 8, height: height + 62, ...options, resizable: false });
    this.element.classList.add('cr-mobile-launch-window');
    // A theme can change the title bar and borders: keep the screen exact.
    this._onTheme = () => requestAnimationFrame(() => this.fitScreen());
    document.addEventListener('cr-themechange', this._onTheme);
  }

  open(viewport) {
    super.open(viewport);
    this.fitScreen();
    return this;
  }

  /** Sizes the window so its content area is exactly screenSize. */
  fitScreen() {
    if (!this.element.isConnected || !this.parent) return;
    const { width, height } = this.constructor.screenSize;
    const dw = width - this.contentElement.clientWidth;
    const dh = height - this.contentElement.clientHeight;
    const b = this.bounds;
    const w = b.width + dw;
    const h = b.height + dh;
    // Move up if the phone would reach below the Viewport's StatusBar.
    const room = this.parent.element.clientHeight - this._bottom() - h;
    const y = Math.max(this._top(), Math.min(b.y, room));
    if (dw || dh || y !== b.y) this.setBounds(b.x, y, w, h);
  }

  dispose() {
    document.removeEventListener('cr-themechange', this._onTheme);
    super.dispose();
  }
}
