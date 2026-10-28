// The layout managers (see layout.js), by name.

import { LayoutError } from './layout.js';
import { BasicLayout } from './basic.js';
import { CanvasLayout } from './canvas.js';
import { DockLayout } from './dock.js';
import { FlowLayout } from './flow.js';
import { GridLayout } from './grid.js';
import { GrowLayout } from './grow.js';
import { HBoxLayout, VBoxLayout } from './box.js';

export * from './layout.js';
export { BasicLayout, CanvasLayout, DockLayout, FlowLayout, GridLayout, GrowLayout, HBoxLayout, VBoxLayout };

/** name -> layout class, in the order qooxdoo lists them. */
export const LAYOUTS = Object.freeze({
  basic: BasicLayout,
  canvas: CanvasLayout,
  dock: DockLayout,
  flow: FlowLayout,
  grid: GridLayout,
  grow: GrowLayout,
  hbox: HBoxLayout,
  vbox: VBoxLayout,
});

export const LAYOUT_NAMES = Object.freeze(Object.keys(LAYOUTS));

/** A new layout from its name (any case); throws a LayoutError for a name there is none of. */
export function makeLayout(name) {
  const Kind = LAYOUTS[String(name).toLowerCase()];
  if (!Kind) throw new LayoutError(`there is no layout '${name}'; the layouts are ${LAYOUT_NAMES.join(', ')}`);
  return new Kind();
}
