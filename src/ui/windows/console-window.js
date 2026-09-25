// ConsoleWindow: the language-neutral base for consoles - an HSplitWindow
// with source on the left, an OutputPanel on the right, and Run, Clear Output and
// Clear Input buttons. Subclasses supply the language: a title prefix, the
// starting source, and run().

import { HSplitWindow } from './hsplit-window.js';
import { TextPanel } from '../widgets/text-panel.js';
import { OutputPanel } from '../widgets/output-panel.js';
import { StatusBar } from '../widgets/status-bar.js';
import { Menu } from '../widgets/menu.js';
import { DesktopLaunchWindow, MobileLaunchWindow } from './launch-window.js';
import { openFile, saveFile } from '../files.js';

// While a program runs its output pane fades a little (the amount is a
// theme variable), and comes back when the program ends.
const STYLE = `
.cr-console-output{transition:opacity .2s ease}
.cr-running .cr-console-output{opacity:var(--cr-output-running-opacity)}
`;

function installStyle() {
  if (document.getElementById('cr-console-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-console-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

// Every console, of any language, cascades from the same starting point.
let opened = 0;
// Each subclass numbers its own windows: Basic Console, Basic Console 2, ...
const counts = new Map();

export class ConsoleWindow extends HSplitWindow {
  /** The title prefix, e.g. 'Basic Console'. Subclasses override. */
  static get titlePrefix() { return 'Console'; }

  /**
   * Creates the source pane. Subclasses may override to supply a different
   * TextPanel, such as a MonacoPanel with syntax highlighting.
   */
  createInput(text) {
    return new TextPanel({ text });
  }

  /** The source a new console starts with. Subclasses override. */
  static get defaultText() { return ''; }

  /** The file types this console opens and saves. Subclasses override. */
  static get fileTypes() { return [{ description: 'Text', accept: { 'text/plain': ['.txt'] } }]; }

  /** Extension for a new file's suggested name, e.g. '.crumb'. */
  static get fileExtension() { return this.fileTypes[0].accept[Object.keys(this.fileTypes[0].accept)[0]][0]; }

  /** True if this console's language uses files with this name. */
  static handles(fileName) {
    const lower = fileName.toLowerCase();
    return this.fileTypes.some((t) => Object.values(t.accept).flat().some((ext) => lower.endsWith(ext)));
  }

  constructor(options = {}) {
    const cls = new.target;
    const n = counts.get(cls) ?? 0;
    counts.set(cls, n + 1);
    const offset = (opened++ % 8) * 24;   // cascade each new console
    super({
      title: n === 0 ? cls.titlePrefix : `${cls.titlePrefix} ${n + 1}`,
      x: 440 + offset, y: 55 + offset, width: 560, height: 320,
      ...options,
    });
    installStyle();
    this.element.classList.add('cr-console-window');
    this.baseTitle = this.title;
    this.fileName = null;     // the file this console was opened from or saved to
    this.fileHandle = null;   // its handle, where the browser provides one
    // The script's name when it did not come from a file (e.g. a database
    // record opened in a console).
    this.recordName = options.scriptName ?? null;
    this.input = this.createInput(options.text ?? cls.defaultText);
    // The right side is an OutputPanel (Text, Board and Canvas tabs);
    // output is its Text page, which programs print to.
    this.outputPanel = new OutputPanel();
    this.outputPanel.element.classList.add('cr-console-output');
    this.output = this.outputPanel.textPanel;
    this.left = this.input;
    this.right = this.outputPanel;

    this.buttonBar.addButton('Run', () => this.run());
    this.buttonBar.addButton('Clear Output', () => { this.outputPanel.clear(); });
    this.buttonBar.addButton('Clear Input', () => { this.input.text = ''; this.input.focus(); });
    this.launchMenu = this.buttonBar.add(new Menu('Launch'));
    this.launchMenu.addItem('Desktop', () => this.launch('desktop'));
    this.launchMenu.addItem('Mobile', () => this.launch('mobile'));

    // Ctrl+Enter in the source runs the code.
    this.input.element.addEventListener('submit', () => this.run());
  }

  /**
   * Compiles source in this console's language and spawns it on the shared
   * scheduler, printing to options.output (a TextPanel) and putting widgets
   * on options.gui (an AppScreen's host, if any); load errors are written to output
   * instead. Does not start the scheduler. Returns
   * { process, errorCount }. The base class has no language: no process.
   */
  static spawn(source, options = {}) { // eslint-disable-line no-unused-vars
    return { process: null, errorCount: 0 };
  }

  /** Runs the source in the left pane. The base class does nothing. */
  run() {
    return null;
  }

  /**
   * Opens a LaunchWindow for the source (the Launch menu): a
   * MobileLaunchWindow for 'mobile', otherwise a DesktopLaunchWindow.
   */
  launch(target) {
    const Cls = target === 'mobile' ? MobileLaunchWindow : DesktopLaunchWindow;
    const win = new Cls({ source: this.input.text, console: this });
    return win.open(this.parent);
  }

  /** Stops this console's program, if one is running. The base has none. */
  stop() {}

  /** True while a program started from this console is running. */
  get running() { return this.element.classList.contains('cr-running'); }
  set running(value) { this.element.classList.toggle('cr-running', Boolean(value)); }

  // ------------------------------------------------------------------ files

  /** Puts a file's source in this console and remembers where it came from. */
  load({ name, text, handle = null }) {
    this.input.text = text;
    this.output.text = '';
    this._setFile(name, handle);
  }

  /** The name of the script in this console: its file name, else the
   *  name it was opened with (options.scriptName, e.g. a database record's
   *  name), else the console's title. */
  get scriptName() { return this.fileName ?? this.recordName ?? this.baseTitle; }

  /** Writes the source back to its file, or asks where to save it. */
  async save() {
    if (!this.fileName) return this.saveAs();
    return this._save({ name: this.fileName, handle: this.fileHandle });
  }

  /** Asks where to save the source, and saves it there. */
  async saveAs() {
    const cls = this.constructor;
    const name = this.fileName ?? `${this.baseTitle.toLowerCase().replace(/\s+/g, '-')}${cls.fileExtension}`;
    return this._save({ name, handle: null });
  }

  async _save({ name, handle }) {
    try {
      const saved = await saveFile(this.input.text, { name, handle, types: this.constructor.fileTypes });
      if (!saved) return false;
      this._setFile(saved.name, saved.handle);
      StatusBar.instance.show(`Saved ${saved.name}`);
      return true;
    } catch (err) {
      StatusBar.instance.show(`Could not save ${name}: ${err.message}`, 'error');
      return false;
    }
  }

  /** True if this console's file can be deleted from here: the browser
   *  gave a handle for it (File System Access API) that supports remove(). */
  get canDeleteFile() {
    return Boolean(this.fileHandle && typeof this.fileHandle.remove === 'function');
  }

  /**
   * Deletes this console's file, after the user confirms. The source stays
   * in the console, which no longer has a file, so Save asks where to save.
   */
  async deleteFile() {
    if (!this.canDeleteFile) return false;
    const name = this.fileName;
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return false;
    try {
      await this.fileHandle.remove();
      this._setFile(null, null);
      StatusBar.instance.show(`Deleted ${name}`);
      return true;
    } catch (err) {
      StatusBar.instance.show(`Could not delete ${name}: ${err.message}`, 'error');
      return false;
    }
  }

  _setFile(name, handle) {
    this.fileName = name;
    this.fileHandle = handle;
    this.title = name ? `${this.baseTitle} \u2014 ${name}` : this.baseTitle;
    this.element.dispatchEvent(new CustomEvent('windowstate', { bubbles: true, detail: { window: this } }));
  }

  /**
   * Asks for a file and opens it in a new console of the class whose
   * language matches its extension.
   * @param {Function[]} classes ConsoleWindow subclasses, the first is the fallback
   */
  static async openInNewConsole(classes, viewport) {
    const types = classes.flatMap((c) => c.fileTypes);
    try {
      const file = await openFile(types);
      if (!file) return null;
      const Cls = classes.find((c) => c.handles(file.name)) ?? classes[0];
      const win = new Cls();
      win.load(file);
      win.open(viewport);
      StatusBar.instance.show(`Opened ${file.name}`);
      return win;
    } catch (err) {
      StatusBar.instance.show(`Could not open the file: ${err.message}`, 'error');
      return null;
    }
  }

  close() {
    const closed = super.close();
    if (closed) this.stop();
    return closed;
  }

  // ----------------------------------------------------- status bar messages

  /** Reports load errors on the StatusBar. */
  reportLoadErrors(count) {
    StatusBar.instance.show(`${this.title}: ${count} load error${count === 1 ? '' : 's'}`, 'error');
  }

  /** Reports that a program has started. */
  reportStarted(process) {
    this.running = true;
    StatusBar.instance.show(`${this.title}: running (pid ${process.pid})`);
  }

  /** Reports how a program ended. */
  reportExited(process) {
    this.running = false;
    const bar = StatusBar.instance;
    if (process.state === 'failed') bar.show(`${this.title}: stopped with an error`, 'error');
    else if (process.state === 'killed') bar.show(`${this.title}: stopped`);
    else bar.show(`${this.title}: finished in ${process.vm.steps} steps`);
  }
}
