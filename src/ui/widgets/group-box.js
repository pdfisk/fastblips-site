// GroupBox, CheckGroupBox and RadioGroupBox: a Composite in a frame, under a
// title (see docs/widgets.txt). Modelled on qooxdoo's qx.ui.groupbox: a
// GroupBox has a title, a CheckGroupBox a check box in it, a RadioGroupBox a
// radio button.
//
// The children are placed by a layout manager like a Composite's, inside the
// frame, below the title; the default layout is vbox. While a CheckGroupBox is
// unchecked, or a RadioGroupBox is not the one checked, its children are
// dimmed and cannot be used (the content is "disabled"): they are made
// inert, so they take neither clicks nor the keyboard.
//
// Checking a RadioGroupBox unchecks the others in its group: the
// RadioGroupBoxes in the same container, or, when it has a group name, every
// one with that name in the same tree of widgets. The widget fires a change
// event with detail { checked } whenever its state changes.

import { Composite } from './composite.js';

/** The height of the title row, in pixels. */
export const LEGEND_HEIGHT = 24;

/** The width of the frame's line and the space inside it, in pixels. */
export const FRAME_WIDTH = 1;
export const FRAME_PADDING = 6;

const STYLE = `
.cr-groupbox-legend{position:absolute;left:0;right:0;top:0;height:${LEGEND_HEIGHT}px;display:flex;
  align-items:center;gap:6px;padding:0 8px;box-sizing:border-box;white-space:nowrap;overflow:hidden;
  cursor:default;font:var(--cr-font-size) var(--cr-font-ui);color:inherit}
.cr-groupbox-legend input{margin:0;accent-color:var(--cr-accent)}
.cr-groupbox-frame{position:absolute;left:0;right:0;top:${LEGEND_HEIGHT}px;bottom:0;box-sizing:border-box;
  border:${FRAME_WIDTH}px solid var(--cr-divider);border-radius:var(--cr-radius-button);pointer-events:none}
.cr-groupbox-off>:not(.cr-groupbox-legend):not(.cr-groupbox-frame){opacity:.5}
`;

function installStyle() {
  if (document.getElementById('cr-groupbox-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-groupbox-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class GroupBox extends Composite {
  /**
   * @param {string} [text] - the title
   * @param {{indicator?: 'checkbox'|'radio'|null, layout?: string}} [options] -
   *   what the title has beside it (nothing for a plain GroupBox), and the layout
   */
  constructor(text = '', { indicator = null, layout = 'vbox' } = {}) {
    super({ layout });
    installStyle();
    this.element.classList.add('cr-groupbox');
    // A check box starts checked, a radio button not.
    this._checked = indicator === 'checkbox';
    this.legend = document.createElement('label');
    this.legend.className = 'cr-groupbox-legend';
    this.input = null;
    if (indicator) {
      this.input = document.createElement('input');
      this.input.type = indicator;
      this.input.checked = this._checked;
      this.input.addEventListener('change', (e) => {
        e.stopPropagation();    // the box's own change event says it
        this.checked = this.input.checked;
      });
      this.legend.appendChild(this.input);
    }
    this.caption = document.createElement('span');
    this.legend.appendChild(this.caption);
    this.frame = document.createElement('div');
    this.frame.className = 'cr-groupbox-frame';
    this.element.appendChild(this.legend);
    this.element.appendChild(this.frame);
    this.text = text;
    this._syncContent();
  }

  /** The title. */
  get text() { return this.caption.textContent; }
  set text(value) { this.caption.textContent = String(value); }

  /** What the layout leaves for the title and the frame: [top, right, bottom, left]. */
  get frameInsets() {
    const around = FRAME_WIDTH + FRAME_PADDING;
    return [LEGEND_HEIGHT + around, around, around, around];
  }

  /** Whether the title's check box or radio button is checked (always false without one). */
  get checked() { return this.input ? this._checked : false; }
  set checked(value) {
    if (!this.input) throw new Error('a GroupBox without a check box or radio button has no checked state');
    const next = Boolean(value);
    this.input.checked = next;
    if (next === this._checked) return;
    this._checked = next;
    this._syncContent();
    this._changed(next);
    this.element.dispatchEvent(new CustomEvent('change', { detail: { checked: next } }));
  }

  /** True when the children can be used: always for a plain GroupBox, else while checked. */
  get contentEnabled() { return this.input ? this._checked : true; }

  /** Called when the state has changed, before the change event. Subclasses override. */
  _changed() {}

  /** Dims the children and makes them inert while the content is disabled. */
  _syncContent() {
    const on = this.contentEnabled;
    this.element.classList.toggle('cr-groupbox-off', !on);
    for (const child of this._children) child.element.inert = !on;
  }

  add(child) {
    super.add(child);
    child.element.inert = !this.contentEnabled;
    return child;
  }

  remove(child) {
    super.remove(child);
    child.element.inert = false;
  }
}

export class CheckGroupBox extends GroupBox {
  /** @param {string} [text] - the title; the box starts checked */
  constructor(text = '') {
    super(text, { indicator: 'checkbox' });
    this.element.classList.add('cr-check-groupbox');
  }
}

export class RadioGroupBox extends GroupBox {
  /** @param {string} [text] - the title; the box starts unchecked */
  constructor(text = '') {
    super(text, { indicator: 'radio' });
    this.element.classList.add('cr-radio-groupbox');
    this._group = '';
  }

  /** The name of the group; '' for the RadioGroupBoxes in the same container. */
  get group() { return this._group; }
  set group(value) { this._group = String(value); }

  /** The other RadioGroupBoxes in this one's group. */
  peers() {
    let root = this;
    while (root.parent) root = root.parent;
    const same = (w) => (this._group !== '' ? w._group === this._group : w._group === '' && w.parent === this.parent);
    return [...root.descendants()].filter((w) => w !== this && w instanceof RadioGroupBox && same(w));
  }

  _changed(next) {
    if (next) for (const peer of this.peers()) peer.checked = false;
  }
}
