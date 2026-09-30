// Panel: abstract widget that contains other widgets (see docs/widgets.txt).

import { Widget } from './widget.js';

export class Panel extends Widget {
  constructor(tag = 'div') {
    super(tag);
    if (new.target === Panel) {
      throw new TypeError('Panel is abstract and cannot be instantiated directly');
    }
    this._children = [];
  }

  /** Read-only view of the child widgets. */
  get children() { return [...this._children]; }

  get childWidgets() { return this.children; }

  add(child) {
    if (!(child instanceof Widget)) throw new TypeError('Panel children must be Widgets');
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this._children.push(child);
    this.element.appendChild(child.element);
    return child;
  }

  remove(child) {
    const index = this._children.indexOf(child);
    if (index < 0) return;
    this._children.splice(index, 1);
    child.parent = null;
    child.element.remove();
  }

  /** Subclasses place their children, then call super.layout(). */
  layout() {
    for (const child of this._children) child.layout();
  }
}
