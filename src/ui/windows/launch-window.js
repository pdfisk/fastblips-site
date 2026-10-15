// LaunchWindow: a window that runs a console's program as an app, opened
// from the console's Launch menu. Abstract: DesktopLaunchWindow is an
// ordinary resizable window, MobileLaunchWindow is the size of a phone
// screen and cannot be resized (see docs/widgets.txt).

import { Window } from './window.js';
import { AppScreen } from '../widgets/app-screen.js';
import { ProgramRunner, ProgramSetRunner } from '../program-runner.js';

// Every launch window, of either kind, cascades from the same point.
let opened = 0;

export class LaunchWindow extends Window {
  /** The kind of launch: 'Desktop' or 'Mobile'. */
  static get kind() { return 'Launch'; }

  /**
   * @param {object} options - Window options, plus `source` (the program)
   *   and `console` (the ConsoleWindow it was launched from). The title
   *   is the name of the console's script. `autoStart` (default true)
   *   runs the program as soon as the window is first opened.
   *   Without a console (an app from the Applications window), `language`
   *   (BasicConsoleWindow or PythonConsoleWindow), `compiled` (the record's
   *   compiled code) and `priority` say how to run the source; give a `title`.
   *   `programs` instead runs several together, in order (a project's
   *   scripts): [{ name, language, source, compiled, priority }]; give a
   *   `title`.
   */
  constructor({
    source = '', console = null, language = null, compiled = null, priority, programs = null,
    autoStart = true, ...options
  } = {}) {
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
    // A copy of the console's code, taken at launch: later edits in the
    // console do not change it. The console's class compiles and runs it
    // (see ConsoleWindow.spawn), so Go works even after the console closes.
    this.source = String(source ?? '');
    this.console = console;
    this.language = console ? console.constructor : language;
    this.screen = new AppScreen();
    this.screen.element.classList.add('cr-launch-screen');
    this.textPanel = this.screen.textPanel;
    this.content = this.screen;
    this.runner = programs ? new ProgramSetRunner({ programs, screen: this.screen }) : new ProgramRunner({
      language: this.language,
      source: this.source,
      screen: this.screen,
      name: () => this.title,
      // The console's compiled code (if its source came with some) and its
      // Priority menu's setting, as they are at each Go.
      compiled: () => (this.console ? this.console.compiled ?? null : compiled),
      priority: () => (this.console ? this.console.priority : priority),
    });
    this.goButton = this.buttonBar.addButton('Go', () => this.go());
    this.resetButton = this.buttonBar.addButton('Reset', () => this.reset());
    this.autoStart = Boolean(autoStart);
    this._autoStarted = false;
  }

  /**
   * Shows the window. The first time, once it is in the Viewport and laid
   * out (for a MobileLaunchWindow, fitted to the phone screen), the program
   * starts, as if Go were pressed, unless autoStart is false. Restoring a
   * minimized or hidden window does not run it again.
   */
  open(viewport) {
    super.open(viewport);
    this.fitScreen();
    if (this.autoStart && !this._autoStarted) {
      this._autoStarted = true;
      this.go();
    }
    return this;
  }

  /** Fits the window to its screen; only MobileLaunchWindow has one. */
  fitScreen() {}

  /**
   * Runs the program (the Go button): stops any previous run, clears the
   * text panel and starts the source on the shared scheduler, printing to
   * the text panel. Returns the Process, or null if there were load errors.
   */
  go() { return this.runner.go(); }

  /** Stops the program, if it is running. */
  stop() { this.runner.stop(); }

  /** Puts the app back to its starting state (the Reset button): stops the
   *  program and clears the text panel. */
  reset() { this.runner.reset(); }

  /** The running Process, or null. */
  get process() { return this.runner.process; }

  close() {
    const closed = super.close();
    if (closed) this.stop();
    return closed;
  }

  dispose() {
    this.stop();
    super.dispose();
  }
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
    // Text output a little larger and darker than elsewhere, easier to read
    // on the phone-sized screen.
    const { style } = this.textPanel.textArea;
    style.fontSize = 'calc(var(--cr-font-size) + 2px)';
    style.color = 'color-mix(in srgb, var(--cr-text) 75%, #000)';
    // A theme can change the title bar and borders: keep the screen exact.
    this._onTheme = () => requestAnimationFrame(() => this.fitScreen());
    document.addEventListener('cr-themechange', this._onTheme);
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
