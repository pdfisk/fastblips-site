// SelectBox: a drop-down that shows the item chosen from a list (see
// docs/widgets.txt). Modelled on qooxdoo's qx.ui.form.SelectBox. The element
// is a <select>, so the list is the browser's own and works with the keyboard,
// a screen reader and a touch screen.
//
// Like qooxdoo's, a SelectBox with items always has one chosen: the first item
// added is chosen, and removing the chosen item chooses its neighbour.
// select(-1) chooses none. The widget fires a select event, a CustomEvent with
// detail { index, text }, whenever the item chosen changes, whether the user
// or the program changed it (as a TabPanel and a ListPanel do); index is -1
// when none is chosen.

import { Widget } from './widget.js';

const STYLE = `
.cr-select-box{box-sizing:border-box;margin:0;padding:0 6px;outline:0;
  border:1px solid var(--cr-divider);border-radius:var(--cr-radius-button);
  background:var(--cr-input-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-ui)}
.cr-select-box:focus{border-color:var(--cr-accent)}
.cr-select-box:disabled{opacity:.6}
`;

function installStyle() {
  if (document.getElementById('cr-select-box-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-select-box-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class SelectBox extends Widget {
  constructor() {
    super('select');
    installStyle();
    this.element.classList.add('cr-select-box');
    this._options = [];       // the <option> of each item, in order
    this._selected = -1;      // the widget keeps the choice; the element shows it
    this.element.addEventListener('change', () => this._choose(this.element.selectedIndex));
  }

  /** The items' texts, in order. */
  get items() { return this._options.map((o) => o.textContent); }

  /** How many items there are. */
  get count() { return this._options.length; }

  /** Index of the item chosen, or -1 for none. */
  get selectedIndex() { return this._selected; }

  /** The text of the item chosen, or '' for none. */
  get selectedText() { return this._options[this._selected]?.textContent ?? ''; }

  /** False greys the box out so the user cannot use it. */
  get enabled() { return !this.element.disabled; }
  set enabled(value) { this.element.disabled = !value; }

  _check(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._options.length) {
      throw new Error(this._options.length === 0 ? `index ${index}: there are no items` : `index ${index} is out of range 0..${this._options.length - 1}`);
    }
    return index;
  }

  /** Adds an item at the end; the first item added is chosen. */
  addItem(text) {
    const option = document.createElement('option');
    option.textContent = String(text);
    this.element.appendChild(option);
    this._options.push(option);
    if (this._selected < 0) this._choose(0);
  }

  /** Takes the item at index out. When it was the one chosen, its neighbour is chosen. */
  removeItem(index) {
    this._check(index);
    const [option] = this._options.splice(index, 1);
    option.remove();
    if (index < this._selected) {
      this._selected -= 1;
    } else if (index === this._selected) {
      this._selected = -1;
      this._choose(this._options.length ? Math.min(index, this._options.length - 1) : -1, true);
    }
  }

  /** Changes the text of the item at index. */
  setItem(index, text) {
    this._options[this._check(index)].textContent = String(text);
  }

  /** The text of the item at index. */
  getItem(index) {
    return this._options[this._check(index)].textContent;
  }

  /** Takes every item out; none is chosen. */
  clear() {
    for (const option of this._options) option.remove();
    this._options = [];
    this._choose(-1);
  }

  /** Chooses the item at index (-1 for none) and fires select if that changes the choice. */
  select(index) {
    this._choose(index === -1 ? -1 : this._check(index));
  }

  // Makes the choice, mirrors it in the element, and says so. `force` fires
  // the event even when the index is the same (the item there is another one).
  _choose(index, force = false) {
    if (index === this._selected && !force) return;
    this._selected = index;
    this.element.selectedIndex = index;
    this.element.dispatchEvent(new CustomEvent('select', { detail: { index, text: this.selectedText } }));
  }

  /** Moves the keyboard focus to the box. */
  focus() { this.element.focus(); }
}
