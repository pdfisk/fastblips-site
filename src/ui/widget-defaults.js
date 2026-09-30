// Where a program's new widget goes and how big it is, by class: its box
// (left, top, width, height) on the screen or in a Panel. A Window has none:
// it places itself. Shared by the widget host (program-widgets.js) and the
// GUI designer (designer-model.js), which must agree on them.

export const DEFAULT_BOXES = Object.freeze({
  Label: [0, 0, 100, 24],
  Button: [0, 0, 100, 32],
  Menu: [0, 0, 90, 28],
  Spacer: [0, 0, 0, 0],
  Panel: [0, 0, 320, 200],
  HPanel: [0, 0, 320, 32],
  VPanel: [0, 0, 320, 200],
  ButtonBar: [0, 0, 320, 30],
  HSplitPanel: [0, 0, 320, 200],
  VSplitPanel: [0, 0, 320, 200],
  TabPanel: [0, 0, 320, 200],
  Window: null,
  TextPanel: [0, 0, 240, 120],
  MonacoPanel: [0, 0, 320, 200],
  ListPanel: [0, 0, 160, 160],
});

/** A new Window's bounds (x, y, width, height). */
export const DEFAULT_WINDOW_BOUNDS = Object.freeze([20, 20, 320, 240]);

/** Classes whose natural width is their text's (in a row). */
export const TEXT_SIZED = new Set(['Label', 'Button', 'Menu']);
