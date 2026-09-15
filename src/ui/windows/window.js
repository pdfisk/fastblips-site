// Window: a top-level panel that floats above the Viewport's content and can
// be moved, resized or closed (see docs/widgets.txt).

import { Panel } from '../widgets/panel.js';

const TITLE_HEIGHT = 24;
const GRIP = 6;   // thickness of the resize edges, in pixels

let topZ = 10;

const STYLE = `
.cr-window{box-sizing:border-box;background:#f4f4f4;border:1px solid #888;
  box-shadow:0 4px 16px rgba(0,0,0,.25);font:13px system-ui,sans-serif;
  display:flex;flex-direction:column;overflow:hidden}
.cr-window-title{flex:0 0 ${TITLE_HEIGHT}px;display:flex;align-items:center;
  padding:0 4px 0 8px;background:#3a5f8f;color:#fff;cursor:move;user-select:none}
.cr-window-title span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr-window-close{border:0;background:transparent;color:inherit;font:16px/1 system-ui;
  width:20px;height:20px;cursor:pointer;border-radius:3px}
.cr-window-close:hover{background:rgba(255,255,255,.25)}
.cr-window-content{flex:1;position:relative;overflow:hidden}
.cr-window-grip{position:absolute}
.cr-window[hidden]{display:none}
`;

function installStyle() {
  if (document.getElementById('cr-window-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-window-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
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
    minWidth = 120, minHeight = 60 } = {}) {
    super();
    installStyle();
    this.minWidth = minWidth;
    this.minHeight = minHeight;
    this.element.classList.add('cr-window');

    this.titleBar = document.createElement('div');
    this.titleBar.className = 'cr-window-title';
    this.titleText = document.createElement('span');
    const close = document.createElement('button');
    close.className = 'cr-window-close';
    close.title = 'Close';
    close.textContent = '×';
    close.addEventListener('pointerdown', (e) => e.stopPropagation());
    close.addEventListener('click', () => this.close());
    this.titleBar.append(this.titleText, close);

    this.contentElement = document.createElement('div');
    this.contentElement.className = 'cr-window-content';
    this.element.append(this.titleBar, this.contentElement);

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

  /** Shows the window in the given Viewport (above earlier windows). */
  open(viewport) {
    if (this.parent !== viewport) viewport.add(this);
    this.visible = true;
    this.bringToFront();
    this.layout();
    return this;
  }

  bringToFront() {
    this.element.style.zIndex = String(++topZ);
  }

  /**
   * Closes the window. A cancelable 'close' event is dispatched on the
   * window's element first; calling preventDefault() keeps it open.
   * @returns {boolean} true if the window closed
   */
  close() {
    const event = new CustomEvent('close', { cancelable: true, detail: { window: this } });
    if (!this.element.dispatchEvent(event)) return false;
    if (this.parent) this.parent.remove(this);
    return true;
  }

  // Lowest y a window may be dragged to (below the parent's Navbar, if any).
  _top() {
    return this.parent && typeof this.parent.top === 'number' ? this.parent.top : 0;
  }

  /** True when the window is in a Viewport and not hidden. */
  get isOpen() { return Boolean(this.parent) && this.visible; }

  /** Opens the window if it is closed or hidden, otherwise hides it. */
  toggle(viewport) {
    if (this.isOpen) this.visible = false;
    else this.open(viewport);
    return this.isOpen;
  }

  // Drag helper: 'move' moves the window, otherwise dirs is a combination of
  // n/s/e/w naming the edges being dragged.
  _drag(handle, dirs) {
    handle.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
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
          y = Math.min(Math.max(y + dy, this._top()), vh - TITLE_HEIGHT);
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
