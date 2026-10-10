// SignInWindow: the singleton window for choosing the user this browser works
// as (File > Sign In). The server has no credentials yet, so signing in is
// only giving a name, which must be a registered one (File > Register...): it sets the user of db-client.js, whose space the
// Database windows, the Designer and programs then read and save in. Signing
// out is the SignOutWindow (File > Sign Out, shown instead while signed in).

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { Toast } from '../toast.js';
import { userName, setUser, findUser, USER_NAME_PATTERN } from '../db-client.js';

const STYLE = `
.cr-sign-in{box-sizing:border-box;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.cr-sign-in-row{display:flex;align-items:center;gap:8px}
.cr-sign-in-name{flex:1;min-width:60px;height:22px;box-sizing:border-box;padding:0 6px;
  border:1px solid var(--cr-field-border);border-radius:var(--cr-radius-field);
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-code)}
.cr-sign-in-status{color:var(--cr-header-info);font-size:var(--cr-font-size-small)}
.cr-sign-in-error{color:var(--cr-danger);font-size:var(--cr-font-size-small);min-height:1.2em}
`;

export function installStyle() {
  if (document.getElementById('cr-sign-in-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-sign-in-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The form: a User name field, who is signed in now, and an error line. */
class SignInPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-sign-in');
    const row = document.createElement('div');
    row.className = 'cr-sign-in-row';
    const label = document.createElement('label');
    label.textContent = 'User name';
    this.nameInput = document.createElement('input');
    this.nameInput.className = 'cr-sign-in-name';
    this.nameInput.spellcheck = false;
    this.nameInput.autocomplete = 'username';
    this.nameInput.maxLength = 30;
    label.htmlFor = this.nameInput.id = `cr-sign-in-name-${Math.random().toString(36).slice(2)}`;
    row.append(label, this.nameInput);
    this.status = document.createElement('div');
    this.status.className = 'cr-sign-in-status';
    this.error = document.createElement('div');
    this.error.className = 'cr-sign-in-error';
    this.error.setAttribute('role', 'alert');
    this.element.append(row, this.status, this.error);
  }
}

let instance = null;

export class SignInWindow extends Window {
  /** The single SignInWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new SignInWindow();
    return instance;
  }

  /**
   * @param {{lookup?: typeof findUser}} options - lookup finds a registered
   *   user by name (replaced in tests)
   */
  constructor({ lookup = findUser } = {}) {
    if (instance) throw new Error('SignInWindow is a singleton; use SignInWindow.instance');
    super({ title: 'Sign In', x: 120, y: 90, width: 320, height: 150, resizable: false });
    instance = this;
    this.lookup = lookup;
    this.busy = false;   // waiting for the server
    this.element.classList.add('cr-sign-in-window');
    this.panel = new SignInPanel();
    this.content = this.panel;
    this.signInButton = this.buttonBar.addButton('Sign In', () => this.signIn());
    this.buttonBar.addButton('Cancel', () => this.close());

    const input = this.panel.nameInput;
    input.addEventListener('input', () => { this.panel.error.textContent = ''; this.updateButtons(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.signIn(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    // Settings > User (or another window) switched user: show who it is now.
    this._onUserChange = () => this.refresh();
    document.addEventListener('cr-userchange', this._onUserChange);
    this.refresh();
  }

  /** The name typed in the field, trimmed. */
  get name() { return this.panel.nameInput.value.trim(); }

  /** Shows the user signed in now, and puts their name in the field. */
  refresh() {
    const user = userName();
    this.panel.nameInput.value = user;
    this.panel.status.textContent = user ? `Signed in as ${user}` : 'Not signed in: working in the shared space';
    this.panel.error.textContent = '';
    this.updateButtons();
  }

  updateButtons() {
    this.signInButton.enabled = this.name !== '' && !this.busy;
    this.buttonBar.layout();
  }

  /**
   * Signs in as the name in the field and closes, if the server has a user
   * registered under it. A bad name, an unregistered one or a server that
   * cannot be reached is reported instead.
   * @returns {Promise<boolean>} true if signed in
   */
  async signIn() {
    const name = this.name;
    if (!name || this.busy) return false;
    if (!USER_NAME_PATTERN.test(name)) return this._fail('A user name is 2 to 30 letters, digits, - or _');
    this.busy = true;
    this.panel.error.textContent = '';
    this.panel.status.textContent = 'Signing in...';
    this.updateButtons();
    let user;
    try {
      user = await this.lookup(name);
    } catch (e) {
      this.busy = false;
      return this._fail(e?.message || 'Could not sign in');
    }
    this.busy = false;
    if (!this.isOpen) return false;   // closed while the server was answering
    if (!user) return this._fail(`There is no user called ${name}. Register first (File > Register...)`);
    const viewport = this.parent;
    const signedInAs = user.name ?? name;
    setUser(signedInAs);
    this.close();
    if (viewport) Toast.show(viewport, { kind: 'success', message: `Signed in as ${signedInAs}` });
    return true;
  }

  // Shows why signing in failed and gives the name field the focus back.
  _fail(message) {
    const user = userName();
    this.panel.status.textContent = user ? `Signed in as ${user}` : 'Not signed in: working in the shared space';
    this.panel.error.textContent = message;
    this.updateButtons();
    this.panel.nameInput.focus();
    return false;
  }

  /** Opens the window showing the current user, with the name selected. */
  open(viewport) {
    super.open(viewport);
    this.refresh();
    this.panel.nameInput.focus();
    this.panel.nameInput.select();
    return this;
  }

  dispose() {
    document.removeEventListener('cr-userchange', this._onUserChange);
    super.dispose();
    instance = null;
  }
}
