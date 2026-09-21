// Window: a top-level panel that floats above the Viewport's content and can
// be moved, resized or closed (see docs/widgets.txt).

import { Panel } from '../widgets/panel.js';
import { ButtonBar, BUTTON_BAR_HEIGHT } from '../widgets/button-bar.js';
import { installTheme } from '../theme.js';

const TITLE_HEIGHT = 24;
const GRIP = 6;   // thickness of the resize edges, in pixels

let topZ = 10;

const STYLE = `
.cr-window{box-sizing:border-box;background:var(--cr-window-bg);color:var(--cr-text);
  border:1px solid var(--cr-window-border);box-shadow:var(--cr-window-shadow-inactive);
  padding:var(--cr-window-padding);
  font:var(--cr-font-size) var(--cr-font-ui);
  display:flex;flex-direction:column;overflow:hidden}
.cr-window.cr-window-active{box-shadow:var(--cr-window-shadow)}
.cr-window-title{flex:0 0 ${TITLE_HEIGHT}px;display:flex;align-items:center;
  padding:0 4px 0 8px;background:var(--cr-title-bg-inactive);color:var(--cr-title-text-inactive);
  font-weight:var(--cr-title-font-weight);cursor:move;user-select:none;gap:2px}
.cr-window-active .cr-window-title{background:var(--cr-title-bg);color:var(--cr-title-text)}
.cr-window-title span{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;margin:var(--cr-title-label-margin);padding:var(--cr-title-label-padding);
  background:var(--cr-title-label-bg)}
.cr-window-tool{flex:none;border:0;background:var(--cr-tool-bg);color:var(--cr-tool-text);
  box-shadow:var(--cr-tool-shadow);font:normal 16px/1 var(--cr-font-ui);
  width:22px;height:18px;padding:0;cursor:pointer;border-radius:var(--cr-radius-field)}
.cr-window-tool:hover{background:var(--cr-title-hover)}
.cr-window-close:hover{background:var(--cr-close-hover);color:var(--cr-close-hover-text)}
.cr-window.cr-maximized{box-shadow:none;padding:0}
.cr-window.cr-maximized .cr-window-title{cursor:default}
.cr-window.cr-maximized .cr-window-grip{display:none}
.cr-window-content{flex:1;position:relative;overflow:hidden}
.cr-window-buttons{flex:0 0 ${BUTTON_BAR_HEIGHT}px;position:relative}
.cr-window-grip{position:absolute}
.cr-window[hidden]{display:none}
`;

function installStyle() {
  if (document.getElementById('cr-window-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-window-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
  installTheme();
}

// Resize handles: which edges each one moves, and its cursor.
const GRIPS = [
  { dirs: 'n', css: `top:0;left:${GRIP}px;right:${GRIP}px;height:${GRIP}px`, cursor: 'ns-resize' },
  { dirs: 's', css: `bottom:0;left:${GRIP}px;right:${GRIP}px;height:${GRIP}px`, cursor: 'ns-resize' },
  { dirs: 'w', css: `left:0;top:${GRIP}px;bottom:${GRIP}px;width:${GRIP}px`, cursor: 'ew-resize' },
  { dirs: 'e', css: `right:0;top:${GRIP}px;bottom:${GRIP}px;width:${GRIP}px`, cursor: 'ew-resize' },
  { dirs: 'nw', css: `top:0;left:0;width:${GRIP}px;height:${GRIP}px`, cursor: 'nwse-resize' },
  { dirs: 'ne', css: `top:0;right:0;width:${GRIP}px;height:${GRIP}px`, cursor: 'nesw-resize' },
  { dirs: 'sw', css: `bottom:0;left:0;width:${GRIP}px;height:${GRIP}px`, cursor: 'nesw-resize' },
  { dirs: 'se', css: `bottom:0;right:0;width:${GRIP}px;height:${GRIP}px`, cursor: 'nwse-resize' },
];

export class Window extends Panel {
  /**
   * @param {{title?: string, x?: number, y?: number, width?: number,
   *          height?: number, minWidth?: number, minHeight?: number}} options
   */
  constructor({ title = '', x = 0, y = 0, width = 300, height = 200,
    minWidth = 120, minHeight = 90 } = {}) {
    super();
    installStyle();
    this.minWidth = minWidth;
    this.minHeight = minHeight;
    this.element.classList.add('cr-window');

    this.titleBar = document.createElement('div');
    this.titleBar.className = 'cr-window-title';
    this.titleText = document.createElement('span');
    const tool = (label, text, action, extraClass = '') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cr-window-tool ${extraClass}`.trim();
      button.title = label;
      button.setAttribute('aria-label', label);
      button.textContent = text;
      button.addEventListener('pointerdown', (e) => e.stopPropagation());
      button.addEventListener('dblclick', (e) => e.stopPropagation());
      button.addEventListener('click', action);
      return button;
    };
    this.minimizeButton = tool('Minimize', '\u2013', () => this.minimize(), 'cr-window-minimize');
    this.maximizeButton = tool('Maximize', '\u25a1', () => this.toggleMaximize(), 'cr-window-maximize');
    const close = tool('Close', '\u00d7', () => this.close(), 'cr-window-close');
    this.titleBar.append(this.titleText, this.minimizeButton, this.maximizeButton, close);
    this.titleBar.addEventListener('dblclick', () => this.toggleMaximize());

    this.maximized = false;
    this.minimized = false;
    this._restoreBounds = null;   // bounds to return to from maximized

    this.contentElement = document.createElement('div');
    this.contentElement.className = 'cr-window-content';
    // Every window has a ButtonBar along its bottom edge. It is laid out by
    // the window but is not one of its children (the child is the content).
    this.buttonBar = new ButtonBar();
    this.buttonBar.parent = this;
    this.buttonBarElement = document.createElement('div');
    this.buttonBarElement.className = 'cr-window-buttons';
    this.buttonBarElement.appendChild(this.buttonBar.element);
    this.element.append(this.titleBar, this.contentElement, this.buttonBarElement);

    for (const grip of GRIPS) {
      const handle = document.createElement('div');
      handle.className = 'cr-window-grip';
      handle.style.cssText = `${grip.css};cursor:${grip.cursor}`;
      this._drag(handle, grip.dirs);
      this.element.appendChild(handle);
    }
    this._drag(this.titleBar, 'move');
    this.element.addEventListener('pointerdown', () => this.bringToFront(), true);

    this.title = title;
    this.setBounds(x, y, width, height);
  }

  get title() { return this.titleText.textContent; }
  set title(text) { this.titleText.textContent = text; }

  /** The single child widget shown in the content area. */
  get content() { return this._children[0] ?? null; }
  set content(widget) {
    for (const child of this.children) this.remove(child);
    if (widget) this.add(widget);
  }

  add(child) {
    super.add(child);
    this.contentElement.appendChild(child.element);   // inside the content area
    this.layout();
    return child;
  }

  layout() {
    this.buttonBar.setBounds(0, 0, this.buttonBarElement.clientWidth, BUTTON_BAR_HEIGHT);
    this.buttonBar.layout();
    const child = this.content;
    if (child) {
      child.setBounds(0, 0, this.contentElement.clientWidth, this.contentElement.clientHeight);
    }
    super.layout();
  }

  setBounds(x, y, width, height) {
    super.setBounds(x, y, Math.max(width, this.minWidth), Math.max(height, this.minHeight));
    this.layout();
  }

  /** Shows the window in the given Viewport (above earlier windows). A
   *  minimized window is restored. */
  open(viewport) {
    if (this.parent !== viewport) viewport.add(this);
    this.visible = true;
    if (this.minimized) {
      this.minimized = false;
      this._stateChanged();
    }
    if (this.maximized) this.fitToParent();
    this.bringToFront();
    this.layout();
    return this;
  }

  bringToFront() {
    if (!this.isFront) this.element.style.zIndex = String(++topZ);
    Window.refreshActive(this.parent);
  }

  /** True when this is the active window: the front-most one showing. */
  get isActive() { return this.element.classList.contains('cr-window-active'); }

  /**
   * Marks the front-most showing window in `parent` as active (a stronger
   * title bar and shadow) and the rest as inactive. Called whenever windows
   * are raised, opened, hidden, minimized or closed.
   */
  static refreshActive(parent) {
    const windows = parent?.windows;
    if (!windows) return;
    const showing = windows.filter((w) => w.visible);
    const active = showing[showing.length - 1] ?? null;
    for (const win of windows) win.element.classList.toggle('cr-window-active', win === active);
  }

  /** True when this is the frontmost window. */
  get isFront() { return this.element.style.zIndex === String(topZ); }

  /**
   * Closes the window. A cancelable 'close' event is dispatched on the
   * window's element first; calling preventDefault() keeps it open.
   * @returns {boolean} true if the window closed
   */
  close() {
    const event = new CustomEvent('close', { cancelable: true, detail: { window: this } });
    if (!this.element.dispatchEvent(event)) return false;
    if (this.minimized) {
      this.minimized = false;
      this._stateChanged();
    }
    const parent = this.parent;
    if (parent) parent.remove(this);
    this.element.classList.remove('cr-window-active');
    Window.refreshActive(parent);
    return true;
  }

  // Lowest y a window may be dragged to (below the parent's Navbar, if any).
  _top() {
    return this.parent && typeof this.parent.top === 'number' ? this.parent.top : 0;
  }

  // Height reserved at the bottom of the parent (its StatusBar, if any).
  _bottom() {
    return this.parent && typeof this.parent.bottom === 'number' ? this.parent.bottom : 0;
  }

  // ---------------------------------------------------- minimize / maximize

  /** Hides the window; open() (or its StatusBar button) brings it back. */
  minimize() {
    if (!this.parent || this.minimized) return;
    this.minimized = true;
    this.visible = false;
    Window.refreshActive(this.parent);
    this._stateChanged();
  }

  /** Makes the window fill the parent between its Navbar and StatusBar. */
  maximize() {
    if (this.maximized) return;
    this._restoreBounds = { ...this.bounds };
    this.maximized = true;
    this.element.classList.add('cr-maximized');
    this.maximizeButton.textContent = '\u2750';
    this.maximizeButton.title = 'Restore';
    this.maximizeButton.setAttribute('aria-label', 'Restore');
    this.fitToParent();
    this.bringToFront();
    this._stateChanged();
  }

  /** Returns a maximized window to the size and place it had before. */
  restore() {
    if (!this.maximized) return;
    this.maximized = false;
    this.element.classList.remove('cr-maximized');
    this.maximizeButton.textContent = '\u25a1';
    this.maximizeButton.title = 'Maximize';
    this.maximizeButton.setAttribute('aria-label', 'Maximize');
    const b = this._restoreBounds;
    if (b) this.setBounds(b.x, b.y, b.width, b.height);
    this._stateChanged();
  }

  toggleMaximize() {
    if (this.maximized) this.restore();
    else this.maximize();
  }

  /** Sizes a maximized window to its parent; the Viewport calls this on resize. */
  fitToParent() {
    const parent = this.parent;
    if (!parent) return;
    const top = this._top();
    const width = parent.element.clientWidth;
    const height = parent.element.clientHeight - top - this._bottom();
    this.setBounds(0, top, width, height);
  }

  // Tells listeners on the window or any ancestor (the Viewport) that the
  // window was minimized, restored, maximized or un-maximized.
  _stateChanged() {
    this.element.dispatchEvent(new CustomEvent('windowstate', {
      bubbles: true,
      detail: { window: this, minimized: this.minimized, maximized: this.maximized },
    }));
  }

  /** True when the window is in a Viewport and not hidden. */
  get isOpen() { return Boolean(this.parent) && this.visible; }

  /** Opens the window if it is closed or hidden, otherwise hides it. */
  toggle(viewport) {
    if (this.isOpen) {
      this.visible = false;
      Window.refreshActive(this.parent);
    } else this.open(viewport);
    return this.isOpen;
  }

  // Drag helper: 'move' moves the window, otherwise dirs is a combination of
  // n/s/e/w naming the edges being dragged.
  _drag(handle, dirs) {
    handle.addEventListener('pointerdown', (down) => {
      if (down.button !== 0 || this.maximized) return;
      down.preventDefault();
      handle.setPointerCapture(down.pointerId);
      const start = { ...this.bounds };
      const sx = down.clientX;
      const sy = down.clientY;
      const vw = this.parent ? this.parent.element.clientWidth : window.innerWidth;
      const vh = this.parent ? this.parent.element.clientHeight : window.innerHeight;

      const onMove = (e) => {
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        let { x, y, width, height } = start;
        if (dirs === 'move') {
          // Keep the title bar reachable.
          x = Math.min(Math.max(x + dx, 40 - width), vw - 40);
          y = Math.min(Math.max(y + dy, this._top()), vh - this._bottom() - TITLE_HEIGHT);
        } else {
          if (dirs.includes('e')) width = Math.max(this.minWidth, width + dx);
          if (dirs.includes('s')) height = Math.max(this.minHeight, height + dy);
          if (dirs.includes('w')) {
            const w = Math.max(this.minWidth, width - dx);
            x += width - w; width = w;
          }
          if (dirs.includes('n')) {
            const h = Math.max(this.minHeight, height - dy);
            const ny = Math.max(this._top(), y + height - h);
            height = y + height - ny; y = ny;
          }
        }
        this.setBounds(x, y, width, height);
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }
}
