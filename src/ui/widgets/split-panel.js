// SplitPanel: abstract panel with two children separated by a divider the
// user can drag. HSplitPanel and VSplitPanel choose the direction
// (see docs/widgets.txt).

import { Panel } from './panel.js';

export const DIVIDER_SIZE = 6;

export class SplitPanel extends Panel {
  /**
   * @param {{first?: Widget, second?: Widget, position?: number,
   *          minSize?: number}} options - position is the fraction (0..1) of
   *   the space given to the first child.
   */
  constructor({ first = null, second = null, position = 0.5, minSize = 40 } = {}) {
    super();
    if (new.target === SplitPanel) {
      throw new TypeError('SplitPanel is abstract and cannot be instantiated directly');
    }
    this.element.classList.add('cr-split-panel');
    this.minSize = minSize;
    this.defaultPosition = position;
    this._position = position;
    this._first = null;
    this._second = null;

    this.divider = document.createElement('div');
    this.divider.className = 'cr-split-divider';
    this.divider.style.cssText = `position:absolute;background:#d0d0d0;z-index:1;cursor:${this.cursor}`;
    this.element.appendChild(this.divider);
    this._wireDivider();

    if (first) this.first = first;
    if (second) this.second = second;
  }

  /** 'horizontal' (side by side) or 'vertical' (stacked). */
  get orientation() { throw new Error('SplitPanel subclasses must define orientation'); }
  get cursor() { return this.orientation === 'horizontal' ? 'col-resize' : 'row-resize'; }

  get first() { return this._first; }
  set first(widget) { this._setSide('_first', widget); }
  get second() { return this._second; }
  set second(widget) { this._setSide('_second', widget); }

  /** Fraction (0..1) of the space given to the first child. */
  get position() { return this._position; }
  set position(value) {
    this._position = Math.min(1, Math.max(0, value));
    this.layout();
    this.element.dispatchEvent(new CustomEvent('change', { detail: { position: this._position } }));
  }

  add(child) {
    if (this._children.length >= 2) throw new Error('A SplitPanel holds exactly two children');
    return super.add(child);
  }

  _setSide(key, widget) {
    if (this[key]) this.remove(this[key]);
    this[key] = widget;
    if (widget) super.add(widget);
    this.layout();
  }

  remove(child) {
    super.remove(child);
    if (this._first === child) this._first = null;
    if (this._second === child) this._second = null;
  }

  layout() {
    const horizontal = this.orientation === 'horizontal';
    const { width, height } = this.bounds;
    const total = (horizontal ? width : height) - DIVIDER_SIZE;
    if (total > 0) {
      const min = Math.min(this.minSize, total / 2);
      const a = Math.round(Math.min(total - min, Math.max(min, total * this._position)));
      const b = total - a;
      if (horizontal) {
        this._first?.setBounds(0, 0, a, height);
        this._second?.setBounds(a + DIVIDER_SIZE, 0, b, height);
        Object.assign(this.divider.style, { left: `${a}px`, top: '0', width: `${DIVIDER_SIZE}px`, height: `${height}px` });
      } else {
        this._first?.setBounds(0, 0, width, a);
        this._second?.setBounds(0, a + DIVIDER_SIZE, width, b);
        Object.assign(this.divider.style, { left: '0', top: `${a}px`, width: `${width}px`, height: `${DIVIDER_SIZE}px` });
      }
    }
    super.layout();
  }

  _wireDivider() {
    this.divider.addEventListener('dblclick', () => { this.position = this.defaultPosition; });
    this.divider.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      down.preventDefault();
      down.stopPropagation();
      this.divider.setPointerCapture(down.pointerId);
      const rect = this.element.getBoundingClientRect();
      const onMove = (e) => {
        const horizontal = this.orientation === 'horizontal';
        const offset = horizontal ? e.clientX - rect.left : e.clientY - rect.top;
        const total = (horizontal ? rect.width : rect.height) - DIVIDER_SIZE;
        if (total > 0) this.position = (offset - DIVIDER_SIZE / 2) / total;
      };
      const onUp = () => {
        this.divider.removeEventListener('pointermove', onMove);
        this.divider.removeEventListener('pointerup', onUp);
        this.divider.removeEventListener('pointercancel', onUp);
      };
      this.divider.addEventListener('pointermove', onMove);
      this.divider.addEventListener('pointerup', onUp);
      this.divider.addEventListener('pointercancel', onUp);
    });
  }
}
