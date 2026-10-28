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
  Ellipse: [0, 0, 120, 80],
  RoundedRect: [0, 0, 120, 80],
  Composite: [0, 0, 320, 200],
  Stack: [0, 0, 320, 200],
  Image: [0, 0, 100, 100],
  CheckGroupBox: [0, 0, 320, 200],
  RadioGroupBox: [0, 0, 320, 200],
  TextField: [0, 0, 160, 28],
  PasswordField: [0, 0, 160, 28],
});

/** The classes that place their children with a layout, and the layout each starts with. */
export const DEFAULT_LAYOUTS = Object.freeze({ Composite: 'basic', CheckGroupBox: 'vbox', RadioGroupBox: 'vbox' });
export const LAYOUT_CLASSES = new Set(Object.keys(DEFAULT_LAYOUTS));

/** A new Window's bounds (x, y, width, height). */
export const DEFAULT_WINDOW_BOUNDS = Object.freeze([20, 20, 320, 240]);

/** Classes whose natural width is their text's (in a row). */
export const TEXT_SIZED = new Set(['Label', 'Button', 'Menu']);

/** Classes that ask for their own natural size, not their class's default box (an Image, once loaded). */
export const NATURAL_SIZED = new Set(['Image']);
