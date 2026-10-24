// Ellipse and RoundedRect: filled shapes with an outline (see docs/widgets.txt).
//
// The fill is the widget's background and the outline its colour, so
// setBackground and setColor paint them like any widget. A circle is an
// Ellipse that is as wide as it is high. A RoundedRect has rounded corners,
// of a radius in pixels (a radius of 0 is a plain rectangle).

import { Widget } from './widget.js';

const STYLE = `
.cr-shape{box-sizing:border-box;background:var(--cr-accent);color:var(--cr-text)}
`;

function installStyle() {
  if (document.getElementById('cr-shape-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-shape-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The default width of an outline, in pixels. */
export const DEFAULT_BORDER_WIDTH = 2;

/** The default corner radius of a RoundedRect, in pixels. */
export const DEFAULT_RADIUS = 12;

class Shape extends Widget {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-shape');
    this.borderWidth = DEFAULT_BORDER_WIDTH;
  }

  /** The width of the outline in pixels (0 for none); the outline is drawn in the widget's colour. */
  get borderWidth() { return this._borderWidth; }
  set borderWidth(value) {
    this._borderWidth = Math.max(0, Math.round(Number(value) || 0));
    // Border colour is left at its default, currentColor: the colour set on the widget.
    this.element.style.border = `${this._borderWidth}px solid currentColor`;
  }

  // A shape has no text, so it has no natural size: it is as big as its box.
  preferredWidth() { return this.bounds.width; }
  preferredHeight() { return this.bounds.height; }
}

export class Ellipse extends Shape {
  constructor() {
    super();
    this.element.classList.add('cr-ellipse');
    this.element.style.borderRadius = '50%';
  }
}

export class RoundedRect extends Shape {
  constructor() {
    super();
    this.element.classList.add('cr-rounded-rect');
    this.radius = DEFAULT_RADIUS;
  }

  /** The corner radius in pixels. */
  get radius() { return this._radius; }
  set radius(value) {
    this._radius = Math.max(0, Math.round(Number(value) || 0));
    this.element.style.borderRadius = `${this._radius}px`;
  }
}
