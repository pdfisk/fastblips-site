// LaunchWindow: a window that runs a console's program as an app, opened
// from the console's Launch menu. Abstract: DesktopLaunchWindow is an
// ordinary resizable window, MobileLaunchWindow is the size of a phone
// screen and cannot be resized (see docs/widgets.txt).

import { Window } from './window.js';
import { AppScreen } from '../widgets/app-screen.js';
import { ProgramRunner, ProgramSetRunner, describeCompile } from '../program-runner.js';
import { Toast } from '../toast.js';
import { runUrl, projectUrl } from '../app-list.js';
import { SourceWindow, SourceEditor } from './source-window.js';
import { Stack } from '../widgets/stack.js';

/**
 * Fills a Launch menu with the standard items: Desktop, Mobile, a separator
 * and Web. Choosing one calls launch('desktop'), launch('mobile') or
 * launch('web'); enabled, if given, is called with 'desktop', 'mobile' or
 * 'web' and says whether that item can be chosen (greyed out if not).
 * Used by the Launch menus of the console windows, the Applications window
 * and the Projects window.
 */
export function addLaunchItems(menu, launch, enabled) {
  const item = (label, target) => menu.addItem(label, () => launch(target),
    enabled ? { enabled: () => enabled(target) } : {});
  item('Desktop', 'desktop');
  item('Mobile', 'mobile');
  menu.addSeparator();
  item('Web', 'web');
}

/**
 * Opens the app called name (in the space of owner, '' for shared) as a
 * full-page app in a new browser tab: this page with ?app=<name>, or for a
 * project (project: true) ?project=<owner>/<name>. Returns the address
 * opened.
 */
export function launchWeb(name, owner = '', { project = false } = {}) {
  const url = (project ? projectUrl : runUrl)(name, undefined, owner);
  window.open(url, '_blank', 'noopener');
  return url;
}

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
   *   (PythonConsoleWindow), `compiled` (the record's
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
    this.programs = programs;
    this.sourceWindow = null;   // the open SourceWindow, if any
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
    this.sourceButton = this.buttonBar.addButton('Show source', () => this.toggleSource());
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

  /**
   * Opens a read-only window with the source this window runs (the Show
   * source button): the copy taken at launch, or each script of a project,
   * one tab each. Pressed again, it brings that window to the front.
   */
  showSource() {
    if (!this.parent) return null;
    if (this.sourceWindow?.isOpen) return this.sourceWindow.open(this.parent);
    const { scripts } = this;
    const { x, y, width } = this._sourcePlacement(520);
    const win = new SourceWindow({ title: this.title, scripts, x, y, width, onCompile: (editor) => this.compile(editor) });
    win.element.addEventListener('close', () => { if (this.sourceWindow === win) this.sourceWindow = null; });
    this.sourceWindow = win;
    return win.open(this.parent);
  }

  /**
   * Compiles the source (the Compile button, shown with the source): the
   * source as edited in editor (a SourceEditor), if given, else the current
   * source afresh. Later Gos run what compiled. The result pops up as a
   * toast. Returns the runner's recompile() result.
   */
  compile(editor = null) {
    const result = editor ? editor.compileWith(this.runner) : this.runner.recompile();
    if (!this.programs) this.source = this.runner.source;
    if (this.parent) Toast.show(this.parent, describeCompile(result));
    return result;
  }

  /** What the Show source button does: here, showSource(). */
  toggleSource() { return this.showSource(); }

  /** The source this window runs, as [{ name, source }]: the copy taken at
   *  launch, or each script of a project, in order - as last compiled. */
  get scripts() {
    const { sources } = this.runner;
    return this.programs
      ? this.runner.programs.map((p, i) => ({ name: p.name, source: sources[i] }))
      : [{ name: this.title, source: sources[0] }];
  }

  /**
   * Where the SourceWindow goes: beside this window, so it does not cover
   * the program's output - to the right if there is room, else to the left.
   * With room on neither side (a small screen), it is narrowed to the wider
   * side if that leaves a usable width, else it overlaps, kept on screen.
   */
  _sourcePlacement(preferred) {
    const gap = 8;
    const min = 280;   // SourceWindow's minWidth
    const b = this.bounds;
    const total = this.parent.element.clientWidth;
    const right = total - (b.x + b.width) - 2 * gap;   // room to the right
    const left = b.x - 2 * gap;                         // room to the left
    const y = b.y;
    if (right >= preferred) return { x: b.x + b.width + gap, y, width: preferred };
    if (left >= preferred) return { x: b.x - gap - preferred, y, width: preferred };
    if (Math.max(right, left) >= min) {
      return right >= left
        ? { x: b.x + b.width + gap, y, width: right }
        : { x: gap, y, width: left };
    }
    const width = Math.min(preferred, total - 2 * gap);
    return { x: Math.max(0, Math.min(b.x + 32, total - width - gap)), y: b.y + 32, width };
  }

  /** The running Process, or null. */
  get process() { return this.runner.process; }

  close() {
    const closed = super.close();
    if (closed) { this.stop(); this.sourceWindow?.close(); }
    return closed;
  }

  dispose() {
    this.stop();
    this.sourceWindow?.close();
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
    // The phone screen is a Stack: the app's screen (the output), and the
    // source in its place when Show source is pressed.
    this.stack = new Stack();
    this.content = this.stack;
    this.stack.add(this.screen);
    this.sourceEditor = null;  // a SourceEditor, made the first time the source is shown
    this.sourcePanel = null;   // its view, on the stack
    // Shown only with the source; enabled only when it has been edited.
    this.compileButton = this.buttonBar.addButton('Compile', () => this.compile(this.sourceEditor));
    this.compileButton.visible = false;
    // Text output a little larger and darker than elsewhere, easier to read
    // on the phone-sized screen.
    const { style } = this.textPanel.textArea;
    style.fontSize = 'calc(var(--cr-font-size) + 2px)';
    style.color = 'color-mix(in srgb, var(--cr-text) 75%, #000)';
    // A theme can change the title bar and borders: keep the screen exact.
    this._onTheme = () => requestAnimationFrame(() => this.fitScreen());
    document.addEventListener('cr-themechange', this._onTheme);
  }

  /** True while the phone screen shows the source instead of the output. */
  get showingSource() { return this.sourcePanel !== null && this.stack.selectedWidget === this.sourcePanel; }

  /**
   * Shows the source in place of the output, on the phone screen, where it
   * can be edited (a project's scripts one tab each). The Show source button
   * becomes Show output, and Compile is shown. Returns the source view.
   */
  showSource() {
    if (!this.sourcePanel) {
      this.sourceEditor = new SourceEditor(this.scripts, {
        onChange: (editor) => { this.compileButton.enabled = editor.changed; },
      });
      this.sourcePanel = this.stack.add(this.sourceEditor.view);
    }
    this.compileButton.enabled = this.sourceEditor.changed;
    this.stack.select(this.stack.children.indexOf(this.sourcePanel));
    this.sourceButton.label = 'Show output';
    this.compileButton.visible = true;
    this.buttonBar.layout();
    return this.sourcePanel;
  }

  /** Shows the output (the app's screen) again; the button reads Show source. */
  showOutput() {
    this.stack.select(this.stack.children.indexOf(this.screen));
    this.sourceButton.label = 'Show source';
    this.compileButton.visible = false;
    this.buttonBar.layout();
    return this.screen;
  }

  /** The Show source / Show output button: switches between the two. */
  toggleSource() { return this.showingSource ? this.showOutput() : this.showSource(); }

  /** Go shows the output, then runs the program. */
  go() {
    this.showOutput();
    return super.go();
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
