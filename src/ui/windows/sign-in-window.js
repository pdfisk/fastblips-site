// SignInWindow: the singleton window for choosing the user this browser works
// as (File > Sign In). Signing in is giving the name and password of a user
// registered on the server (File > Register...): the server answers with a
// token, which db-client.js then sends with every request so that the user
// may change their scripts. It sets the user of db-client.js, whose space the
// Database windows, the Designer and programs then read and save in. Signing
// out is the SignOutWindow (File > Sign Out, shown instead while signed in).

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { Toast } from '../toast.js';
import { userName, setUser, signIn, USER_NAME_PATTERN } from '../db-client.js';

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
    const passwordRow = document.createElement('div');
    passwordRow.className = 'cr-sign-in-row';
    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'Password';
    this.passwordInput = document.createElement('input');
    this.passwordInput.className = 'cr-sign-in-name';
    this.passwordInput.type = 'password';
    this.passwordInput.autocomplete = 'current-password';
    this.passwordInput.maxLength = 72;
    passwordLabel.htmlFor = this.passwordInput.id = `cr-sign-in-password-${Math.random().toString(36).slice(2)}`;
    passwordRow.append(passwordLabel, this.passwordInput);
    this.status = document.createElement('div');
    this.status.className = 'cr-sign-in-status';
    this.error = document.createElement('div');
    this.error.className = 'cr-sign-in-error';
    this.error.setAttribute('role', 'alert');
    this.element.append(row, passwordRow, this.status, this.error);
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
   * @param {{signIn?: typeof signIn}} options - signIn asks the server to
   *   sign in with a name and password (replaced in tests)
   */
  constructor({ signIn: signInCall = signIn } = {}) {
    if (instance) throw new Error('SignInWindow is a singleton; use SignInWindow.instance');
    super({ title: 'Sign In', x: 120, y: 90, width: 320, height: 185, resizable: false });
    instance = this;
    this.signInCall = signInCall;
    this.busy = false;   // waiting for the server
    this.element.classList.add('cr-sign-in-window');
    this.panel = new SignInPanel();
    this.content = this.panel;
    this.signInButton = this.buttonBar.addButton('Sign In', () => this.signIn());
    this.buttonBar.addButton('Cancel', () => this.close());

    const input = this.panel.nameInput;
    for (const field of [input, this.panel.passwordInput]) {
      field.addEventListener('input', () => { this.panel.error.textContent = ''; this.updateButtons(); });
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.signIn(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      });
    }
    // Settings > User (or another window) switched user: show who it is now.
    this._onUserChange = () => this.refresh();
    document.addEventListener('cr-userchange', this._onUserChange);
    this.refresh();
  }

  /** The name typed in the field, trimmed. */
  get name() { return this.panel.nameInput.value.trim(); }

  /** The password typed (not trimmed). */
  get password() { return this.panel.passwordInput.value; }

  /** Shows the user signed in now, and puts their name in the field. */
  refresh() {
    const user = userName();
    this.panel.nameInput.value = user;
    this.panel.passwordInput.value = '';
    this.panel.status.textContent = user ? `Signed in as ${user}` : 'Not signed in: working in the shared space';
    this.panel.error.textContent = '';
    this.updateButtons();
  }

  updateButtons() {
    this.signInButton.enabled = this.name !== '' && this.password !== '' && !this.busy;
    this.buttonBar.layout();
  }

  /**
   * Signs in with the name and password in the fields and closes, if the
   * server accepts them. A bad name, a wrong password or a server that cannot
   * be reached is reported instead.
   * @returns {Promise<boolean>} true if signed in
   */
  async signIn() {
    const name = this.name;
    if (!name || !this.password || this.busy) return false;
    if (!USER_NAME_PATTERN.test(name)) return this._fail('A user name is 2 to 30 letters, digits, - or _');
    this.busy = true;
    this.panel.error.textContent = '';
    this.panel.status.textContent = 'Signing in...';
    this.updateButtons();
    let user;
    try {
      user = await this.signInCall({ name, password: this.password });
    } catch (e) {
      this.busy = false;
      return this._fail(e?.message || 'Could not sign in');
    }
    this.busy = false;
    if (!this.isOpen) return false;   // closed while the server was answering
    if (!user) return this._fail(`Could not sign in as ${name}`);
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
    this.panel.passwordInput.value = '';
    this.panel.passwordInput.focus();
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
