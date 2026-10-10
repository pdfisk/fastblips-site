// Toast: a short message that pops out from one side of the Viewport, stays
// a few seconds and goes away by itself (or when it is clicked). Unlike a
// NotificationWindow it takes no focus and has no buttons, so it never gets
// in the way. See docs/widgets.txt.
//
// Where toasts come from and how long they stay are settings (Settings >
// Toast Side, Settings > Toast Time): setToastSide() and setToastDuration()
// change them at once and remember the choice for the next visit. A toast can
// also be given its own side and duration.
//
// The settings need no DOM, so they also run (and are tested) under Node.

/** The sides a toast can pop out from: [name, menu label]. */
export const TOAST_SIDES = [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']];

/** The durations Settings offers, in milliseconds. */
export const TOAST_DURATIONS = [1000, 2000, 3000, 5000, 10000];

export const DEFAULT_TOAST_SIDE = 'top';
export const DEFAULT_TOAST_DURATION = 3000;

const SIDE_KEY = 'crumb.toastSide';
const DURATION_KEY = 'crumb.toastDuration';
let side = null;       // set by setToastSide() on this page
let duration = null;   // set by setToastDuration() on this page

function saved(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

function remember(key, value) {
  try { globalThis.localStorage?.setItem(key, String(value)); } catch { /* not remembered */ }
}

function isSide(name) { return TOAST_SIDES.some(([n]) => n === name); }

/** The side toasts come from: the one chosen on this page, else the remembered one, else 'top'. */
export function toastSide() {
  if (side) return side;
  const value = saved(SIDE_KEY);
  return isSide(value) ? value : DEFAULT_TOAST_SIDE;
}

/** Chooses the side toasts come from ('top', 'bottom', 'left' or 'right') and remembers it. */
export function setToastSide(name) {
  if (!isSide(name)) throw new Error(`unknown toast side '${name}'`);
  side = name;
  remember(SIDE_KEY, name);
}

/** How long a toast stays, in milliseconds: the one chosen, else the remembered one, else 3 seconds. */
export function toastDuration() {
  if (duration !== null) return duration;
  const value = Number(saved(DURATION_KEY));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOAST_DURATION;
}

/** Chooses how long toasts stay, in milliseconds (more than 0), and remembers it. */
export function setToastDuration(ms) {
  ms = Number(ms);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('a toast duration is a number of milliseconds above 0');
  duration = ms;
  remember(DURATION_KEY, ms);
}

/** A duration as the Settings menu shows it: 3000 is "3 seconds". */
export function durationLabel(ms) {
  const seconds = ms / 1000;
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

const ICONS = { success: '✓', error: '✕', info: 'i' };
// Where a toast starts from and returns to: a short way out toward its side,
// so it appears to slide in from that edge.
const SLIDE = { top: 'translateY(-48px)', bottom: 'translateY(48px)', left: 'translateX(-48px)', right: 'translateX(48px)' };
const OPEN_MS = 300;
const CLOSE_MS = 250;
const MARGIN = 8;

const STYLE = `
.cr-toast-stack{position:absolute;display:flex;gap:6px;padding:${MARGIN}px;box-sizing:border-box;
  pointer-events:none;z-index:100000}
.cr-toast-stack-top{left:0;right:0;flex-direction:column;align-items:center}
.cr-toast-stack-bottom{left:0;right:0;flex-direction:column-reverse;align-items:center}
.cr-toast-stack-left{left:0;justify-content:center;flex-direction:column;align-items:flex-start}
.cr-toast-stack-right{right:0;justify-content:center;flex-direction:column;align-items:flex-end}
.cr-toast{pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:10px;max-width:min(360px,90vw);
  box-sizing:border-box;padding:8px 14px;border:1px solid var(--cr-menu-border, #999);
  border-radius:var(--cr-radius-button, 4px);background:var(--cr-menu-bg, #fff);color:var(--cr-menu-text, #111);
  box-shadow:var(--cr-menu-shadow, 0 4px 12px rgba(0,0,0,.2));font:var(--cr-font-size) var(--cr-font-ui);
  opacity:0}
.cr-toast.cr-toast-shown{opacity:1;transform:none !important;
  transition:opacity ${OPEN_MS}ms ease-out,transform ${OPEN_MS}ms cubic-bezier(.2,.9,.3,1.2)}
.cr-toast.cr-toast-closing{transition:opacity ${CLOSE_MS}ms ease-in,transform ${CLOSE_MS}ms ease-in}
.cr-toast-icon{flex:none;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:11px;font-weight:bold;line-height:1;
  background:var(--cr-accent, #2a6);color:var(--cr-accent-text, #fff)}
.cr-toast-error .cr-toast-icon{background:var(--cr-danger, #c33);color:#fff}
.cr-toast-message{min-width:0;overflow-wrap:anywhere}
`;

function installStyle() {
  if (document.getElementById('cr-toast-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-toast-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

// The stack of toasts for one side, made on first use and kept below the
// Navbar and above the StatusBar.
function stackFor(viewport, name) {
  let stack = [...viewport.element.children].find((el) => el.classList.contains(`cr-toast-stack-${name}`));
  if (!stack) {
    stack = document.createElement('div');
    stack.className = `cr-toast-stack cr-toast-stack-${name}`;
    viewport.element.appendChild(stack);
  }
  stack.style.top = `${typeof viewport.top === 'number' ? viewport.top : 0}px`;
  const bottom = typeof viewport.bottom === 'number' ? viewport.bottom : 0;
  stack.style.bottom = name === 'top' ? 'auto' : `${bottom}px`;
  if (name === 'top') stack.style.height = 'auto';
  return stack;
}

export class Toast {
  /**
   * Pops a toast out in `viewport` and returns it.
   * @param {{message?: string, kind?: 'success'|'error'|'info', side?: string,
   *          duration?: number}} options - side and duration default to the
   *   Settings (toastSide(), toastDuration())
   * @returns {Toast}
   */
  static show(viewport, options = {}) {
    return new Toast(options).open(viewport);
  }

  constructor({ message = '', kind = 'info', side: sideName = toastSide(), duration: ms = toastDuration() } = {}) {
    if (!(kind in ICONS)) kind = 'info';
    if (!isSide(sideName)) sideName = toastSide();
    this.message = String(message);
    this.kind = kind;
    this.side = sideName;
    this.duration = ms;
    this.isOpen = false;
    this._timer = null;
    this._fade = null;
  }

  /** Slides the toast in, and starts the clock. */
  open(viewport) {
    if (this.isOpen) return this;
    installStyle();
    const el = document.createElement('div');
    el.className = `cr-toast cr-toast-${this.kind}`;
    el.setAttribute('role', this.kind === 'error' ? 'alert' : 'status');
    el.style.transform = SLIDE[this.side];
    const icon = document.createElement('div');
    icon.className = 'cr-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[this.kind];
    const text = document.createElement('div');
    text.className = 'cr-toast-message';
    text.textContent = this.message;
    el.append(icon, text);
    el.addEventListener('click', () => this.close());
    this.element = el;
    stackFor(viewport, this.side).appendChild(el);
    this.isOpen = true;
    // The browser must lay the toast out in its starting place (off to the
    // side, invisible) before it can animate from there: reading offsetWidth
    // forces that, and without it the toast would just appear.
    void el.offsetWidth;
    el.classList.add('cr-toast-shown');
    this._timer = setTimeout(() => this.close(), this.duration);
    return this;
  }

  /** Fades the toast out and removes it. */
  close() {
    if (!this.isOpen) return false;
    this.isOpen = false;
    clearTimeout(this._timer);
    this._timer = null;
    this.element.classList.add('cr-toast-closing');
    this.element.classList.remove('cr-toast-shown');
    this.element.style.transform = SLIDE[this.side];
    this._fade = setTimeout(() => this.element.remove(), CLOSE_MS);
    return true;
  }
}
