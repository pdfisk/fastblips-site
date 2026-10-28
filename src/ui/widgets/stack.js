// Stack: a Panel that holds several widgets on top of each other, each filling
// the whole area, and shows one of them at a time (see docs/widgets.txt). It is
// qooxdoo's qx.ui.container.Stack: a TabPanel without the tabs, for wizards,
// card decks and views the program switches between. The first widget added is
// showing. The Stack sets the visibility of its children: hiding a child
// yourself has no lasting effect.

import { Panel } from './panel.js';
import { GrowLayout } from '../layouts/grow.js';

export class Stack extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-stack');
    this._grow = new GrowLayout();
    this._selected = -1;
  }

  /** Adds a widget on top of the others; the first one added is showing. */
  add(child) {
    super.add(child);
    if (this._selected < 0) this.select(0);
    else child.visible = false;
    return child;
  }

  remove(child) {
    const index = this._children.indexOf(child);
    super.remove(child);
    if (index < 0) return;
    child.visible = true;   // the Stack hid it
    if (index === this._selected) {
      this._selected = -1;
      if (this._children.length) this.select(Math.min(index, this._children.length - 1));
    } else if (index < this._selected) {
      this._selected -= 1;
    }
  }

  /** Index of the widget showing (-1 if there are none). */
  get selectedIndex() { return this._selected; }

  /** The widget showing, or null. */
  get selectedWidget() { return this._children[this._selected] ?? null; }

  /** Shows the widget at this index and fires select. */
  select(index) {
    if (index < 0 || index >= this._children.length || index === this._selected) return;
    this._selected = index;
    this._children.forEach((child, i) => { child.visible = i === index; });
    this.layout();
    this.element.dispatchEvent(new CustomEvent('select', { detail: { index, widget: this.selectedWidget } }));
  }

  /** Shows the next widget, the first after the last. */
  selectNext() {
    if (this._children.length) this.select((this._selected + 1) % this._children.length);
  }

  /** Shows the previous widget, the last before the first. */
  selectPrevious() {
    if (this._children.length) this.select((this._selected - 1 + this._children.length) % this._children.length);
  }

  layout() {
    this._grow.apply(this);
    super.layout();
  }
}
