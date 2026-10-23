// SignOutWindow: the singleton window for signing out (File > Sign Out, which
// replaces File > Sign In while a user is signed in). It names who is signed
// in and has a Sign Out button, which goes back to the shared space.

import { Window } from './window.js';
import { Panel } from '../widgets/panel.js';
import { userName, setUser, signOut } from '../db-client.js';
import { Toast } from '../toast.js';
import { installStyle } from './sign-in-window.js';

/** The body: who is signed in now. */
class SignOutPanel extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-sign-in');
    this.status = document.createElement('div');
    this.status.className = 'cr-sign-in-status';
    this.element.append(this.status);
  }
}

let instance = null;

export class SignOutWindow extends Window {
  /** The single SignOutWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new SignOutWindow();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('SignOutWindow is a singleton; use SignOutWindow.instance');
    super({ title: 'Sign Out', x: 120, y: 90, width: 320, height: 110, resizable: false });
    instance = this;
    this.element.classList.add('cr-sign-in-window');
    this.panel = new SignOutPanel();
    this.content = this.panel;
    this.signOutButton = this.buttonBar.addButton('Sign Out', () => this.signOut());
    this.buttonBar.addButton('Cancel', () => this.close());
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    // Signed in or out elsewhere (Settings > User): show who it is now.
    this._onUserChange = () => this.refresh();
    document.addEventListener('cr-userchange', this._onUserChange);
    this.refresh();
  }

  /** Shows the user signed in now; Sign Out is only available while there is one. */
  refresh() {
    const user = userName();
    this.panel.status.textContent = user ? `Signed in as ${user}` : 'Not signed in: working in the shared space';
    this.signOutButton.enabled = user !== '';
    this.buttonBar.layout();
  }

  /** Goes back to the shared space (no user), closes and shows a toast. */
  signOut() {
    const viewport = this.parent;
    const name = userName();
    signOut();   // the server forgets the token; the user is signed out here whatever it answers
    setUser('');
    this.close();
    if (viewport && name) Toast.show(viewport, { kind: 'success', message: `Signed out ${name}` });
  }

  open(viewport) {
    super.open(viewport);
    this.refresh();
    return this;
  }

  dispose() {
    document.removeEventListener('cr-userchange', this._onUserChange);
    super.dispose();
    instance = null;
  }
}
