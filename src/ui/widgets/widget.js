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
    /** A name to find the widget by (findById); '' for none. */
    this.id = '';
  }

  /** The widgets directly inside this one; a Panel's children, and more
   *  for widgets with parts of their own (a Window's ButtonBar). */
  get childWidgets() { return []; }

  /** Every widget inside this one, depth first, in order. */
  *descendants() {
    for (const child of this.childWidgets) {
      yield child;
      yield* child.descendants();
    }
  }

  /** The first widget inside this one whose id is id, or null. */
  findById(id) {
    for (const w of this.descendants()) if (w.id === id) return w;
    return null;
  }

  /**
   * Every widget inside this one of a class: a constructor (matching
   * subclasses too), or a program class name ('Button', as a program's
   * widgets record in programClass).
   */
  findByClass(cls) {
    const match = typeof cls === 'function'
      ? (w) => w instanceof cls
      : (w) => w.programClass === cls;
    return [...this.descendants()].filter(match);
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

  /** Natural height, used by VPanel for children without a fixed size. */
  preferredHeight() {
    // Measure without the height a previous layout imposed.
    const saved = this.element.style.height;
    this.element.style.height = '';
    const h = Math.ceil(this.element.scrollHeight);
    this.element.style.height = saved;
    return h;
  }

  /** Sizes and positions this widget's contents. Subclasses override. */
  layout() {}

  /** Removes the widget from the page and from its parent. */
  dispose() {
    if (this.parent) this.parent.remove(this);
    this.element.remove();
  }
}
