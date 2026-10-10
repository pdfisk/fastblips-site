// NotificationWindow: a small window that tells the user how something went:
// a success, an error or plain information. It closes when its OK button is
// pressed (or Enter or Escape), and, given a duration, by itself after that
// long. See docs/widgets.txt.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';

const WIDTH = 300;
const HEIGHT = 140;

const ICONS = { success: '✓', error: '✕', info: 'i' };
const TITLES = { success: 'Success', error: 'Error', info: 'Notice' };

const STYLE = `
.cr-notification{box-sizing:border-box;padding:12px 14px;display:flex;align-items:center;gap:10px;
  overflow:auto}
.cr-notification-icon{flex:none;width:22px;height:22px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;font-weight:bold;line-height:1;
  background:var(--cr-accent);color:var(--cr-accent-text)}
.cr-notification-error .cr-notification-icon{background:var(--cr-danger);color:#fff}
.cr-notification-message{flex:1;min-width:0;overflow-wrap:anywhere}
.cr-notification-error .cr-notification-message{color:var(--cr-danger)}
`;

function installStyle() {
  if (document.getElementById('cr-notification-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-notification-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The content: an icon for the kind of notification, and the message. */
class NotificationPanel extends Panel {
  constructor(kind, message) {
    super();
    installStyle();
    this.element.classList.add('cr-notification', `cr-notification-${kind}`);
    // Errors interrupt a screen reader; the rest wait their turn.
    this.element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const icon = document.createElement('div');
    icon.className = 'cr-notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[kind];
    this.message = document.createElement('div');
    this.message.className = 'cr-notification-message';
    this.message.textContent = message;
    this.element.append(icon, this.message);
  }
}

export class NotificationWindow extends Window {
  /**
   * Opens a notification in `viewport`, centred over `owner` (a Window) if
   * one is given, otherwise in the middle of the viewport.
   * @returns {NotificationWindow}
   */
  static show(viewport, options = {}, owner = null) {
    const win = new NotificationWindow(options);
    const top = typeof viewport.top === 'number' ? viewport.top : 0;
    const area = owner?.bounds ?? {
      x: 0, y: top, width: viewport.element.clientWidth,
      height: viewport.element.clientHeight - top,
    };
    const x = Math.max(0, Math.round(area.x + (area.width - WIDTH) / 2));
    const y = Math.max(top, Math.round(area.y + (area.height - HEIGHT) / 2));
    win.setBounds(x, y, WIDTH, HEIGHT);
    return win.open(viewport);
  }

  /**
   * @param {{message?: string, kind?: 'success'|'error'|'info', title?: string,
   *          duration?: number, onClose?: () => void}} options - duration is
   *   how long the notification stays up, in milliseconds (0, the default,
   *   is until it is closed); onClose is called once, however it closes
   */
  constructor({ message = '', kind = 'info', title, duration = 0, onClose = null } = {}) {
    if (!(kind in ICONS)) kind = 'info';
    super({ title: title ?? TITLES[kind], width: WIDTH, height: HEIGHT, resizable: false });
    this.kind = kind;
    this.duration = duration;
    this.onClose = onClose;
    this._timer = null;
    this.element.classList.add('cr-notification-window');
    this.minimizeButton.hidden = true;   // too short-lived to be worth parking
    this.panel = new NotificationPanel(kind, message);
    this.content = this.panel;
    this.okButton = this.buttonBar.addButton('OK', () => this.close());
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  get message() { return this.panel.message.textContent; }

  /** Opens the notification, focuses OK and starts the clock, if it has one. */
  open(viewport) {
    super.open(viewport);
    this.okButton.element.focus();
    clearTimeout(this._timer);
    if (this.duration > 0) this._timer = setTimeout(() => this.close(), this.duration);
    return this;
  }

  close() {
    if (!super.close()) return false;
    clearTimeout(this._timer);
    this._timer = null;
    const onClose = this.onClose;
    this.onClose = null;
    if (onClose) onClose();
    return true;
  }
}
