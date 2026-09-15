// Widget: abstract base class of every UI element (see docs/widgets.txt).

export class Widget {
  constructor(tag = 'div') {
    if (new.target === Widget) {
      throw new TypeError('Widget is abstract and cannot be instantiated directly');
    }
    this.element = document.createElement(tag);
    this.element.classList.add('cr-widget');
    this.parent = null;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this._visible = true;
  }

  get visible() { return this._visible; }
  set visible(value) {
    this._visible = Boolean(value);
    this.element.hidden = !this._visible;
  }

  /** Background colour of the widget (any CSS colour). */
  get background() { return this.element.style.background; }
  set background(color) { this.element.style.background = color; }

  /** Places the widget; called by its parent during layout. */
  setBounds(x, y, width, height) {
    this.bounds = { x, y, width, height };
    const s = this.element.style;
    s.position = 'absolute';
    s.left = `${x}px`;
    s.top = `${y}px`;
    s.width = `${width}px`;
    s.height = `${height}px`;
  }

  /** Natural width, used by HPanel for children without a fixed size. */
  preferredWidth() {
    return Math.ceil(this.element.scrollWidth);
  }

  /** Sizes and positions this widget's contents. Subclasses override. */
  layout() {}

  /** Removes the widget from the page and from its parent. */
  dispose() {
    if (this.parent) this.parent.remove(this);
    this.element.remove();
  }
}
