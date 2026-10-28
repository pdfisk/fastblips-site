// Composite: a Panel whose children are placed by a layout manager
// (see docs/widgets.txt and src/ui/layouts). It is qooxdoo's
// qx.ui.container.Composite: the general-purpose container, a row, a column,
// a grid, a dock ... depending on its layout. The default layout is basic:
// children sit where the program puts them.
//
//   const form = new Composite({ layout: 'grid' });
//   form.layoutManager.set('spacingX', 8);
//   form.add(label);
//   label.layoutProps = { row: 0, column: 0 };

import { Panel } from './panel.js';
import { makeLayout, Layout } from '../layouts/index.js';

export class Composite extends Panel {
  /** @param {{layout?: string|Layout}} [options] - the layout, by name or made already */
  constructor({ layout = 'basic' } = {}) {
    super();
    this.element.classList.add('cr-composite');
    this._manager = makeLayout('basic');
    this.layoutManager = layout;
  }

  /** The layout manager placing the children. */
  get layoutManager() { return this._manager; }

  /** Sets the layout, by name or as a Layout; the children are placed again. */
  set layoutManager(layout) {
    this._manager = layout instanceof Layout ? layout : makeLayout(layout);
    this.layout();
  }

  /** The name of the layout: 'basic', 'hbox', 'grid', ... */
  get layoutName() { return this._manager.kind; }

  layout() {
    this._manager.apply(this);
    super.layout();
  }
}
