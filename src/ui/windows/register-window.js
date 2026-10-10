// RegisterWindow: the singleton window for registering a new user on the
// database server (File > Register...). It asks for a user name and an
// optional e-mail address, creates the user (POST /users) and signs in as
// them. The server has no credentials yet, so registering only reserves the
// name. How it went is shown in a NotificationWindow: a success message, which
// clears after a few seconds and takes this window with it, or an error
// message, which stays until it is dismissed.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { NotificationWindow } from './notification-window.js';
import { registerUser, setUser, USER_NAME_PATTERN, EMAIL_PATTERN, serverName } from '../db-client.js';

/** How long the success notification stays up, in milliseconds. */
export const SUCCESS_DURATION = 3000;

const STYLE = `
.cr-register{box-sizing:border-box;padding:12px 14px;display:grid;
  grid-template-columns:auto 1fr;align-items:center;gap:8px}
.cr-register-field{min-width:60px;height:22px;box-sizing:border-box;padding:0 6px;
  border:1px solid var(--cr-field-border);border-radius:var(--cr-radius-field);
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-code)}
.cr-register-field:disabled{background:var(--cr-field-disabled-bg)}
.cr-register-note{grid-column:1/-1;color:var(--cr-header-info);font-size:var(--cr-font-size-small)}
`;

function installStyle() {
  if (document.getElementById('cr-register-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-register-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The form: User name and E-mail fields and a note. */
class RegisterPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-register');
    const field = (text, type, autocomplete, maxLength) => {
      const label = document.createElement('label');
      label.textContent = text;
      const input = document.createElement('input');
      input.className = 'cr-register-field';
      input.type = type;
      input.spellcheck = false;
      input.autocomplete = autocomplete;
      input.maxLength = maxLength;
      label.htmlFor = input.id = `cr-register-${Math.random().toString(36).slice(2)}`;
      this.element.append(label, input);
      return input;
    };
    this.nameInput = field('User name', 'text', 'username', 30);
    this.emailInput = field('E-mail', 'email', 'email', 254);
    this.note = document.createElement('div');
    this.note.className = 'cr-register-note';
    this.element.append(this.note);
  }
}

let instance = null;

export class RegisterWindow extends Window {
  /** The single RegisterWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new RegisterWindow();
    return instance;
  }

  /**
   * @param {{register?: typeof registerUser, successDuration?: number}} options -
   *   register is the call that creates the user (replaced in tests);
   *   successDuration is how long the success notification stays up
   */
  constructor({ register = registerUser, successDuration = SUCCESS_DURATION } = {}) {
    if (instance) throw new Error('RegisterWindow is a singleton; use RegisterWindow.instance');
    super({ title: 'Register', x: 140, y: 110, width: 340, height: 170, resizable: false });
    instance = this;
    this.register = register;
    this.successDuration = successDuration;
    this.busy = false;        // waiting for the server
    this.registered = false;  // registered, and the success notification is up
    this.notification = null;   // the NotificationWindow showing, if any
    this.element.classList.add('cr-register-window');
    this.panel = new RegisterPanel();
    this.content = this.panel;
    this.registerButton = this.buttonBar.addButton('Register', () => this.submit());
    this.buttonBar.addButton('Cancel', () => this.close());

    for (const input of [this.panel.nameInput, this.panel.emailInput]) {
      input.addEventListener('input', () => this.updateButtons());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      });
    }
    this.updateButtons();
  }

  /** The name typed, trimmed. */
  get name() { return this.panel.nameInput.value.trim(); }

  /** The e-mail address typed, trimmed ('' for none). */
  get email() { return this.panel.emailInput.value.trim(); }

  updateButtons() {
    const locked = this.busy || this.registered;
    this.registerButton.enabled = !locked && this.name !== '';
    this.panel.nameInput.disabled = locked;
    this.panel.emailInput.disabled = locked;
    this.buttonBar.layout();
  }

  /** Why the fields cannot be registered, or null if they look right. */
  validate() {
    if (!USER_NAME_PATTERN.test(this.name)) {
      return 'A user name is 2 to 30 letters, digits, - or _, starting with a letter or digit';
    }
    if (this.email && !EMAIL_PATTERN.test(this.email)) return 'That is not an e-mail address';
    return null;
  }

  /**
   * Registers the user on the server and signs in as them. A success
   * notification is shown; when it clears (after successDuration, or when it
   * is dismissed) this window closes. A bad field or an error from the
   * server (a name already taken, say) is shown in an error notification and
   * the window stays open.
   * @returns {Promise<boolean>} true if the user was registered
   */
  async submit() {
    if (this.busy || this.registered || !this.name) return false;
    this._dismiss();
    const problem = this.validate();
    if (problem) return this._fail(problem);
    this.busy = true;
    this.panel.note.textContent = 'Registering...';
    this.updateButtons();
    let user;
    try {
      user = await this.register({ name: this.name, email: this.email });
    } catch (e) {
      return this._fail(e?.message || 'Could not register');
    } finally {
      this.busy = false;
      this._showNote();
      this.updateButtons();
    }
    const name = user?.name ?? this.name;
    setUser(name);
    this._succeed(`Registered as ${name}. You are now signed in.`);
    return true;
  }

  // Shows the success notification. The fields stay locked until it clears,
  // which closes this window too.
  _succeed(message) {
    if (!this.isOpen) return;   // closed while the server was answering
    this.registered = true;
    this.panel.note.textContent = '';
    this.updateButtons();
    const done = () => {
      this.notification = null;
      this.close();
    };
    this.notification = NotificationWindow.show(this.parent, {
      kind: 'success', title: 'Registered', message, duration: this.successDuration, onClose: done,
    }, this);
  }

  // Shows an error notification; the name field gets the focus back when it
  // is dismissed.
  _fail(message) {
    if (!this.isOpen) return false;
    this.notification = NotificationWindow.show(this.parent, {
      kind: 'error', title: 'Could not register', message,
      onClose: () => {
        this.notification = null;
        if (this.isOpen) this.panel.nameInput.focus();
      },
    }, this);
    return false;
  }

  // Closes the notification showing, if any, without acting on it.
  _dismiss() {
    const notification = this.notification;
    if (!notification) return;
    this.notification = null;
    notification.onClose = null;
    notification.close();
  }

  /** Closes the window, and its notification with it. */
  close() {
    if (!super.close()) return false;
    this._dismiss();
    this.registered = false;
    return true;
  }

  _showNote() {
    this.panel.note.textContent = `On the ${serverName()} server. The e-mail address is optional.`;
  }

  /** Opens the window with empty fields and the name field focused. */
  open(viewport) {
    super.open(viewport);
    if (!this.busy) {
      this._dismiss();
      this.panel.nameInput.value = '';
      this.panel.emailInput.value = '';
      this._showNote();
      this.updateButtons();
    }
    this.panel.nameInput.focus();
    return this;
  }

  dispose() {
    this._dismiss();
    super.dispose();
    instance = null;
  }
}
