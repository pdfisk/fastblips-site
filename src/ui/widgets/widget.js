// Widget: abstract base class of every UI element (see docs/widgets.txt).

/** A size in pixels: a whole number, 0 or more. */
const pixels = (value) => Math.max(0, Math.round(Number(value) || 0));

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
    this._margin = 0;
    this._padding = null;      // null: left to the widget's own style
    this._borderWidth = 0;
    this._borderColor = '';
  }

  // ---- the box: margin, border, padding (see docs/widgets.txt)
  //
  // From the outside in: the margin is clear space between the widget and the
  // edge of the area its parent gives it; then the border; then the padding
  // between the border and the contents. Sizes are in pixels, whole, 0 or more.

  /** Clear space around the widget, inside the area its parent gives it. */
  get margin() { return this._margin; }
  set margin(value) { this._margin = pixels(value); this._replace(); }

  /** Space between the border and the contents; 0 when none was set. */
  get padding() { return this._padding ?? 0; }
  set padding(value) { this._padding = pixels(value); this._applyPadding(); }

  /** Width of the border (0 for none), drawn in borderColor. */
  get borderWidth() { return this._borderWidth; }
  set borderWidth(value) { this._borderWidth = pixels(value); this._applyBorder(); }

  /** Colour of the border (any CSS colour); '' for the widget's text colour. */
  get borderColor() { return this._borderColor; }
  set borderColor(color) { this._borderColor = String(color ?? ''); this._applyBorder(); }

  /** Width of the widget's own area: its box less margin and border. */
  get innerWidth() { return Math.max(0, this.bounds.width - 2 * (this._margin + this._borderWidth)); }

  /** Height of the widget's own area: its box less margin and border. */
  get innerHeight() { return Math.max(0, this.bounds.height - 2 * (this._margin + this._borderWidth)); }

  /** Draws the border. Subclasses with a border of their own override this. */
  _applyBorder() {
    const s = this.element.style;
    if (!this._borderWidth) { s.border = ''; return; }
    s.boxSizing = 'border-box';
    s.border = `${this._borderWidth}px solid ${this._borderColor || 'currentColor'}`;
  }

  /** Applies the padding. Panels lay their children out themselves and do nothing. */
  _applyPadding() {
    if (this._padding === null) return;
    this.element.style.boxSizing = 'border-box';
    this.element.style.padding = `${this._padding}px`;
  }

  /** Puts the widget in its box again, after the margin changed. */
  _replace() {
    const { x, y, width, height } = this.bounds;
    this.setBounds(x, y, width, height);
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
    const m = this._margin;
    s.position = 'absolute';
    s.left = `${x + m}px`;
    s.top = `${y + m}px`;
    s.width = `${Math.max(0, width - 2 * m)}px`;
    s.height = `${Math.max(0, height - 2 * m)}px`;
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
