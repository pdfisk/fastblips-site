// SplitButton: a button with a drop-down arrow beside it (see
// docs/widgets.txt). Modelled on qooxdoo's qx.ui.form.SplitButton: clicking
// the button does its usual thing, and the arrow opens a menu of related
// actions - "Save", with "Save As..." and "Save a copy" under the arrow.
//
// It is a Panel of two parts, a Button and a Menu (which is the arrow), and
// has the label, action and enabled of the Button and the items of the Menu:
//
//   const save = new SplitButton('Save', () => ...);
//   save.addItem('Save As...', () => ...);
//
// Its parts are laid out here, so nothing else can be added to it.

import { Panel } from './panel.js';
import { Button } from './button.js';
import { Menu } from './menu.js';

/** The width of the arrow part, in pixels. */
export const ARROW_WIDTH = 24;

const STYLE = `
.cr-split-main{border-top-right-radius:0;border-bottom-right-radius:0}
.cr-split-arrow .cr-menu-button{flex:1;box-sizing:border-box;padding:0;text-align:center;
  border:1px solid transparent;border-left-color:var(--cr-divider);
  border-radius:0 var(--cr-radius-button) var(--cr-radius-button) 0;
  background:var(--cr-button-bg);color:var(--cr-button-text);box-shadow:var(--cr-button-shadow)}
.cr-split-arrow .cr-menu-button:hover,.cr-split-arrow.open .cr-menu-button{
  background:var(--cr-button-hover);color:var(--cr-button-text)}
.cr-split-arrow .cr-menu-button:disabled{opacity:.5;cursor:default;background:var(--cr-button-bg)}
`;

function installStyle() {
  if (document.getElementById('cr-split-button-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-split-button-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class SplitButton extends Panel {
  /**
   * @param {string} [label]
   * @param {() => void} [action] - run when the button (not the arrow) is clicked
   */
  constructor(label = '', action = () => {}) {
    super();
    installStyle();
    this.element.classList.add('cr-split-button');
    this.button = new Button(label, action);
    this.button.element.classList.add('cr-split-main');
    this.arrow = new Menu('\u25be');
    this.arrow.element.classList.add('cr-split-arrow');
    super.add(this.button);
    super.add(this.arrow);
  }

  get label() { return this.button.label; }
  set label(text) { this.button.label = text; }

  /** Run when the button part is clicked. */
  get action() { return this.button.action; }
  set action(fn) { this.button.action = fn; }

  get enabled() { return this.button.enabled; }
  set enabled(value) {
    this.button.enabled = value;
    this.arrow.button.disabled = !value;
    if (!value) this.arrow.close();
  }

  /** The items of the menu under the arrow (the Menu's items). */
  get items() { return this.arrow.items; }
  set items(items) { this.arrow.items = items; }

  addItem(label, action, options) { return this.arrow.addItem(label, action, options); }

  addSeparator() { return this.arrow.addSeparator(); }

  get isOpen() { return this.arrow.isOpen; }

  /** Opens the menu, as clicking the arrow does. */
  open() { this.arrow.open(); }

  /** Closes the menu. */
  close() { this.arrow.close(); }

  /** The width it asks for: its button's, and the arrow. */
  preferredWidth() { return this.button.preferredWidth() + ARROW_WIDTH; }

  /** A SplitButton holds only its two parts. */
  add() {
    throw new Error('SplitButton cannot contain other widgets');
  }

  layout() {
    const width = this.innerWidth;
    const height = this.innerHeight;
    const arrow = Math.min(ARROW_WIDTH, width);
    this.button.setBounds(0, 0, width - arrow, height);
    this.arrow.setBounds(width - arrow, 0, arrow, height);
    super.layout();
  }

  dispose() {
    this.arrow.close();
    super.dispose();
  }
}
