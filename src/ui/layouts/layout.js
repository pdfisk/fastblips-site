// Layout: the abstract base of the layout managers a Composite uses to place
// its children (see docs/widgets.txt). The set follows qooxdoo's
// (qx.ui.layout): Basic, Canvas, Grow, HBox, VBox, Dock, Flow and Grid.
//
// A layout has no DOM of its own. apply(container) works out a box for each
// visible child and calls child.setBounds(x, y, width, height) - the box
// includes the child's margin, as everywhere in the toolkit. Positions are
// relative to the area inside the container's padding.
//
// Two kinds of settings feed a layout:
//   the layout's own options   spacing, content alignment, grid tracks ...
//                              (this.options, set with set()/setTrack())
//   the child's layout props   child.layoutProps: { edge, row, column,
//                              rowSpan, columnSpan, alignX, alignY, canvas }
// plus what every child already has: fixedWidth / fixedHeight (a size set by
// the program), flex, box (its place on a free area), fillParent, margin and
// preferredWidth() / preferredHeight() (the size it asks for).

/** Thrown for a setting a layout does not have, or a bad value; message says why. */
export class LayoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LayoutError';
  }
}

export const EDGES = Object.freeze(['north', 'south', 'west', 'east', 'center']);
export const ALIGN_X = Object.freeze(['left', 'center', 'right']);
export const ALIGN_Y = Object.freeze(['top', 'middle', 'bottom']);

/** The layout settings of a child, made on first use. */
export const propsOf = (child) => (child.layoutProps ??= {});

/**
 * The area inside a container's padding: { left, top, width, height }. A
 * container that draws something of its own around its children (a GroupBox's
 * title and frame) says how much room that takes in frameInsets, [top, right,
 * bottom, left], which comes off the area as well.
 */
export function inner(container) {
  const [pt, pr, pb, pl] = container.padding;
  const [ft, fr, fb, fl] = container.frameInsets ?? [0, 0, 0, 0];
  return {
    left: pl + fl,
    top: pt + ft,
    width: Math.max(0, container.innerWidth - pl - pr - fl - fr),
    height: Math.max(0, container.innerHeight - pt - pb - ft - fb),
  };
}

/** The children a layout places: the visible ones, in order. */
export const visibleKids = (container) => container.children.filter((c) => c.visible);

/** A child's box width with its margin: the size it asks for, or the one the program fixed. */
export function wantWidth(child) {
  const [, mr, , ml] = child.margin;
  return (child.fixedWidth ?? child.preferredWidth()) + mr + ml;
}

/** A child's box height with its margin. */
export function wantHeight(child) {
  const [mt, , mb] = child.margin;
  return (child.fixedHeight ?? child.preferredHeight()) + mt + mb;
}

/** Puts a child's box at whole pixels, never negative in size. */
export function place(child, x, y, width, height) {
  const left = Math.round(x);
  const top = Math.round(y);
  child.setBounds(left, top, Math.max(0, Math.round(x + width) - left), Math.max(0, Math.round(y + height) - top));
}

/**
 * Places a child in a slot (x, y, width, height). With an alignment on an
 * axis it takes the size it asks for there and sits at that side of the slot;
 * without one it stretches across the slot.
 */
export function placeInSlot(child, x, y, width, height, alignX, alignY) {
  let w = width;
  let h = height;
  let px = x;
  let py = y;
  if (alignX) {
    w = Math.min(width, wantWidth(child));
    px = x + (alignX === 'right' ? width - w : alignX === 'center' ? (width - w) / 2 : 0);
  }
  if (alignY) {
    h = Math.min(height, wantHeight(child));
    py = y + (alignY === 'bottom' ? height - h : alignY === 'middle' ? (height - h) / 2 : 0);
  }
  place(child, px, py, w, h);
}

const oneOf = (what, value, allowed) => {
  if (!allowed.includes(value)) throw new LayoutError(`${what} must be one of ${allowed.join(', ')}, not '${value}'`);
  return value;
};

const size = (what, value) => {
  if (!Number.isFinite(value) || value < 0) throw new LayoutError(`${what} must be a number of 0 or more, not ${value}`);
  return Math.round(value);
};

/** A canvas length: '' (none), a number of pixels ('12') or a percentage ('50%'). */
export function checkLength(text) {
  const s = String(text).trim();
  if (s === '') return '';
  if (!/^-?\d+(\.\d+)?%?$/.test(s)) throw new LayoutError(`'${text}' is not a length: use a number of pixels, a percentage such as 50%, or '' for none`);
  return s;
}

/** A canvas length in pixels for an extent, or null for none. */
export function lengthPx(text, extent) {
  if (text === undefined || text === '') return null;
  return text.endsWith('%') ? (extent * parseFloat(text)) / 100 : parseFloat(text);
}

/** Checks and copies a child's layout props (as saved); throws a LayoutError. */
export function cleanChildProps(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new LayoutError('layoutProps must be an object');
  const out = {};
  if (raw.edge !== undefined) out.edge = oneOf('edge', raw.edge, EDGES);
  for (const key of ['row', 'column']) {
    if (raw[key] !== undefined) {
      if (!Number.isInteger(raw[key]) || raw[key] < 0) throw new LayoutError(`${key} must be a whole number of 0 or more`);
      out[key] = raw[key];
    }
  }
  for (const key of ['rowSpan', 'columnSpan']) {
    if (raw[key] !== undefined) {
      if (!Number.isInteger(raw[key]) || raw[key] < 1) throw new LayoutError(`${key} must be a whole number of 1 or more`);
      out[key] = raw[key];
    }
  }
  if (raw.alignX !== undefined) out.alignX = oneOf('alignX', raw.alignX, ALIGN_X);
  if (raw.alignY !== undefined) out.alignY = oneOf('alignY', raw.alignY, ALIGN_Y);
  if (raw.canvas !== undefined) {
    if (!Array.isArray(raw.canvas) || raw.canvas.length !== 6) {
      throw new LayoutError('canvas must be a list of six lengths: left, top, right, bottom, width, height');
    }
    out.canvas = raw.canvas.map(checkLength);
  }
  return out;
}

export class Layout {
  /**
   * @param {string} kind - the layout's name: 'hbox', 'grid', ...
   * @param {object} defaults - its options and their default values; an
   *   option a layout lacks cannot be set
   */
  constructor(kind, defaults = {}) {
    if (new.target === Layout) throw new TypeError('Layout is abstract and cannot be instantiated directly');
    this.kind = kind;
    this.defaults = Object.freeze({ ...defaults });
    this.options = { ...defaults };
  }

  /** Places container's visible children. Subclasses override. */
  apply() {}

  /** True when the layout has this option. */
  has(key) { return key in this.defaults; }

  /** Sets an option; throws a LayoutError for one this layout does not have. */
  set(key, value) {
    if (!this.has(key)) throw new LayoutError(`the ${this.kind} layout has no ${key} setting`);
    this.options[key] = this.check(key, value);
  }

  /** Checks an option's value and returns it as kept. */
  check(key, value) {
    if (key === 'reversed') return Boolean(value);
    if (key === 'alignX') return oneOf('alignX', value, ALIGN_X);
    if (key === 'alignY') return oneOf('alignY', value, ALIGN_Y);
    return size(key, value);
  }

  /** The options that differ from their defaults, as saved. */
  toJSON() {
    const out = {};
    for (const [key, value] of Object.entries(this.options)) if (value !== this.defaults[key]) out[key] = value;
    return out;
  }

  /** Sets options from saved ones (see toJSON); throws a LayoutError for a bad one. */
  load(saved = {}) {
    if (!saved || typeof saved !== 'object') throw new LayoutError('layoutOptions must be an object');
    for (const [key, value] of Object.entries(saved)) this.set(key, value);
  }
}
