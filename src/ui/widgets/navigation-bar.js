// NavigationBar: the bar along the top of a page of a phone or tablet app: a
// title in the middle, a back button on the left and an action button on the
// right (see docs/widgets.txt). Modelled on qooxdoo mobile's
// qx.ui.mobile.navigationbar.NavigationBar. (The Navbar is the desktop IDE's
// own menu strip; this is for programs.)
//
// A button shows only while it has text: backText '' hides the back button,
// actionText '' the action button. Both keep their room, so the title stays
// in the middle. The widget fires back and action events (CustomEvents) when
// they are tapped.

import { Widget } from './widget.js';

/** The height a NavigationBar asks for, in pixels: a comfortable touch target. */
export const NAVIGATION_BAR_HEIGHT = 44;

const STYLE = `
.cr-navigation-bar{display:flex;align-items:center;box-sizing:border-box;padding:0 4px;
  background:var(--cr-buttonbar-bg);color:var(--cr-text);border-bottom:1px solid var(--cr-buttonbar-border);
  font:var(--cr-font-size-nav) var(--cr-font-ui);user-select:none}
.cr-navigation-title{flex:1;min-width:0;text-align:center;font-weight:600;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.cr-navigation-back,.cr-navigation-action{flex:none;min-width:64px;max-width:40%;height:100%;box-sizing:border-box;
  border:0;background:transparent;color:var(--cr-accent);font:inherit;padding:0 10px;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-navigation-back{text-align:left}
.cr-navigation-action{text-align:right}
.cr-navigation-back:active,.cr-navigation-action:active{opacity:.5}
`;

function installStyle() {
  if (document.getElementById('cr-navigation-bar-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-navigation-bar-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class NavigationBar extends Widget {
  /** @param {string} [title] */
  constructor(title = '') {
    super('div');
    installStyle();
    this.element.classList.add('cr-navigation-bar');
    this._backText = '';
    this._actionText = '';
    this.backButton = this._button('cr-navigation-back', 'back');
    this.titleElement = document.createElement('span');
    this.titleElement.className = 'cr-navigation-title';
    this.actionButton = this._button('cr-navigation-action', 'action');
    this.element.appendChild(this.backButton);
    this.element.appendChild(this.titleElement);
    this.element.appendChild(this.actionButton);
    this.title = title;
    this.backText = '';
    this.actionText = '';
  }

  // A button that fires the event named `event` on the bar when tapped.
  _button(className, event) {
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    button.addEventListener('click', () => this.element.dispatchEvent(new CustomEvent(event)));
    return button;
  }

  /** The title shown in the middle. */
  get title() { return this.titleElement.textContent; }
  set title(text) { this.titleElement.textContent = String(text); }

  /** The text of the back button, shown after a chevron; '' for no back button. */
  get backText() { return this._backText; }
  set backText(text) {
    this._backText = String(text);
    this.backButton.textContent = this._backText === '' ? '' : `\u2039 ${this._backText}`;
    this.backButton.style.visibility = this._backText === '' ? 'hidden' : 'visible';
  }

  /** The text of the action button on the right; '' for none. */
  get actionText() { return this._actionText; }
  set actionText(text) {
    this._actionText = String(text);
    this.actionButton.textContent = this._actionText;
    this.actionButton.style.visibility = this._actionText === '' ? 'hidden' : 'visible';
  }

  preferredHeight() { return NAVIGATION_BAR_HEIGHT; }
}
