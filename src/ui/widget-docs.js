// The documentation of the widgets a program can make, for the Help menu
// (windows/widget-help-window.js). No DOM here, so it is tested under Node.
//
// What each class is (WIDGET_DOCS) is written here; its constructor and its
// methods come from the class table (WIDGET_CLASSES in
// src/vm/runtime/widgets.js), so they cannot go out of date. A test checks
// that every class has a description, and that every method every widget has
// is described in one of the COMMON_GROUPS.

import { WIDGET_CLASSES, COMMON_METHODS } from '../vm/runtime/widgets.js';

// ---- what each class is -----------------------------------------------------

const SPLIT = (pane, divider) => `Two panes ${pane}, with a divider the user drags (${divider}).
set_first(widget) and set_second(widget) put a widget in each pane (get_first,
get_second read them). set_position(f) and get_position() are the fraction of
the space, from 0 to 1, given to the first pane. on_change(function) is called
with the panel and the new position when the divider moves.`;

const TEXT_AREA = `set_text and get_text, append(text) (adds at the end), set_read_only(True) and
is_read_only(), focus(). on_change(function) is called with the widget and the
new text on each edit; on_submit(function) when the user presses Ctrl+Enter.`;

const CONTAINER = `add(widget) puts a widget inside it, moving it from wherever it was; get_count()
and get_child(i) (from 0) read what is inside; clear() takes everything out.`;

export const WIDGET_DOCS = Object.freeze({
  Viewport: `The program's screen and the root of all its widgets. A singleton: Viewport()
always gives the same object. A widget a program makes appears on it, at the
top left at its class's default size, until it is added to a container.
${CONTAINER}
to_json() gives the whole screen as JSON text and from_json(text) rebuilds it,
wiring each saved handler name to the program's function of that name.
save(name) and load(name) keep a screen in the database, and
load_composite(name) builds a saved composite (a widget and everything in it)
onto the screen and returns its root. The program waits for the database while
other programs keep running.`,

  Label: `A line of text, left-aligned. set_text(text) and get_text() change and read it.
on_click(function) is called with the label.`,

  Button: `A push button. set_enabled(False) greys it out so it cannot be clicked.
on_click(function) is called with the button.`,

  Menu: `A button that opens a list of items. add_item(label, function) adds an item; the
function is called with the menu and the item's label when it is chosen.
add_separator() adds a line between items and clear() removes them all.`,

  Spacer: `Empty space. In an HPanel, a VPanel, a ButtonBar or a Composite row or column
it takes the space left over (its flex is 1).`,

  Panel: `A container whose children sit where the program puts them: set_left, set_top
and set_bounds place a child, and fill() makes it fill the panel.
${CONTAINER}`,

  HPanel: `A row. Its children are placed left to right. Each is as wide as, in order:
the width fixed with set_width, a share of the space left over given by
set_flex, the width it asks for. Across the row each child fills the height.
set_spacing(n) is the gap between children; set_padding(n) the space inside the
edge.
${CONTAINER}`,

  VPanel: `A column: the same as an HPanel, top to bottom. Each child is as high as, in
order: the height fixed with set_height, a share of the space left over given by
set_flex, the height it asks for; across the column it fills the width.
set_spacing(n) is the gap between children.
${CONTAINER}`,

  ButtonBar: `A row of buttons, styled like the bottom bar of a window. add_button(text) makes
a Button in the bar and returns it.
${CONTAINER}`,

  HSplitPanel: SPLIT('side by side', 'a vertical divider'),

  VSplitPanel: SPLIT('one above the other', 'a horizontal divider'),

  TabPanel: `Pages chosen by a row of tabs. add_tab(label, widget) adds a page under a new
tab; the first page added is showing. select(i) shows page i (from 0),
get_selected_index() and get_selected_text() say which is showing, and
get_count() how many there are. on_select(function) is called with the panel and
the index of the page chosen, by the user or by select.`,

  Window: `A floating window with a title bar, content and a button bar. A Window floats
above everything else and cannot go inside another widget; it has no margin,
padding or border. set_title(text), set_content(widget) (the one widget it
shows), get_button_bar() (a ButtonBar along the bottom, with add_button),
open() and close(), maximize(), restore() and is_maximized().
on_close(function) is called when the window is closed.`,

  TextPanel: `A box of text the user can edit, several lines long. TextPanel(text) starts it
with some text.
${TEXT_AREA}`,

  MonacoPanel: `A code editor: Monaco, the editor of VS Code. MonacoPanel(text, language) starts
it with some text; language is a Monaco language id such as "python" or
"plaintext". It has the methods of a TextPanel:
${TEXT_AREA}`,

  ListPanel: `A list the user picks a row from. add_item(text), remove_item(i), set_item(i, text),
get_item(i) and get_count(); clear() empties it. select(i) selects a row (-1 for
none), get_selected_index() is -1 when there is none, and get_selected_text()
is "" then. set_empty_text(text) is what it shows while it has no items.
on_select(function) is called with the list and the index of the row selected.`,

  Board: `The program's board: a grid of cells that hold text, for board games. A
singleton, like the Viewport, but not part of it: it has none of the common
widget methods and is not saved by to_json. Rows and columns count from 0 at the
top left. set_size(rows, columns), get_rows(), get_columns(); set_text,
get_text, set_background, get_background, set_color and get_color all start with
(row, column); set_checkered(b) and set_square_cells(b) change how it looks;
select(row, column), clear_selection(), get_selected_row() and
get_selected_column() (-1 for none); clear(). on_click(function) is called with
the board, and the row and column of the cell clicked. A cell off the board is
an error.`,

  Canvas: `The program's drawing surface, for 2D and simple 3D graphics. A singleton, like
the Board. The drawing is 400 by 300 units until set_size(width, height), with
(0, 0) at the top left; in 3D, x is to the right, y up and z toward the viewer.
2D: point, line, rect, fill_rect, circle, fill_circle, triangle, fill_triangle
and text; set_color, set_background, set_line_width and set_font_size.
3D: set_camera, look_at, orbit, line3d, triangle3d, fill_triangle3d, box3d and
fill_box3d. clear() wipes the drawing. set_auto_update(False) holds the drawing
back until update() shows a frame. A program in a loop of its own (a game) asks
is_key_down(key), get_mouse_x() and get_mouse_y(); other programs use
on_click(function), called with the canvas and the x and y clicked, and
on_key(function), called with the canvas and the key's name.`,

  Physics: `The program's physics world: shapes that fall, bounce, spin and push each other.
A singleton, like the Canvas. The world is 400 by 300 units until
set_size(width, height), with (0, 0) at the top left and y pointing down.
Angles are in degrees. Each shape added (add_circle, add_ball, add_rect,
add_ellipse, add_polygon) returns an id, from 1, that the other methods take; id
0 is a side of the world. set_gravity, set_walls, set_paused; for a shape
set_color, set_label, set_fixed, set_position, set_velocity, set_angle,
set_spin, set_bounce, set_friction and apply_impulse, and get_x, get_y,
get_angle, get_vx and get_vy. body_at(x, y) is the id of the shape there. Shapes
can be combined into one rigid body (add_group, attach, combine, detach), and
scale_to, move_to, rotate_to and oscillate animate a shape or group.
on_click(function) is called with the world and the x and y clicked;
on_collide(function) with the ids of two shapes that hit.`,

  Ellipse: `A filled shape with an outline. The fill is the background (set_background) and
the outline is the colour (set_color); the outline is 2 pixels wide until
set_border_width. An Ellipse as wide as it is high is a circle. on_click(function)
is called with the shape.`,

  RoundedRect: `A rectangle with rounded corners, filled and outlined like an Ellipse.
set_radius(n) is the corner radius in pixels (12 until set; 0 is a plain
rectangle). on_click(function) is called with the shape.`,

  Composite: `A container whose children are placed by a layout. set_layout(name) picks it
(any case); the default is "basic". Changing it drops the old layout's
settings. ${CONTAINER}
The layouts:
  basic   children sit where set_left / set_top / set_bounds put them, or fill
          the area after fill()
  canvas  like basic, but a child can be placed by its distance from the edges
          and its size, in pixels or percentages: set_canvas_bounds(left, top,
          right, bottom, width, height), each "" (not set), "10" or "50%"
  grow    every child fills the area
  hbox    a row: each child is as wide as its fixed width, else a share of the
  vbox    space left over by its flex, else the width it asks for. vbox is the
          same down a column. Across, a child fills unless set_align gives it
          a place
  dock    children attach to an edge in the order added: set_edge("north",
          "south", "west", "east" or "center", the default) on each; the
          center takes what is left
  flow    children side by side, wrapping onto a new line when the next would
          not fit
  grid    rows and columns: set_cell(row, column) and set_span(rows, columns) on
          each child; a column or row is as big as its biggest child unless
          fixed with set_column_width / set_row_height, and flex, min and max
          are set with set_column_flex, set_column_min_width,
          set_column_max_width and the row versions
Settings of the layout: set_spacing(n) (gap between children; for dock, flow and
grid both spacings), set_spacing_x, set_spacing_y, set_content_align(x, y)
(where the group of children sits: x "left", "center" or "right" for hbox and
flow; y "top", "middle" or "bottom" for vbox; "" for the other), set_reversed(b).
A setting the layout does not have is an error that says what it lacks.`,

  Stack: `Children on top of each other, each filling the area, with one showing at a
time: a TabPanel without the tabs. The first child added is showing.
select(i) shows child i (from 0), select_next() and select_previous() go round,
get_selected_index() says which is showing. on_select(function) is called with
the stack and the index. The stack sets its children's visibility.
${CONTAINER}`,

  CheckGroupBox: `A frame around a container, under a title with a check box in it. Like a
Composite, its children are placed by a layout (vbox until set_layout) inside
the frame, below the title, and it has a Composite's methods (see Composite).
While the box is checked the widgets inside can be used; unchecked, they are
dimmed and cannot be clicked or reached with the keyboard. It starts checked.
set_text(title) and get_text(); set_checked(b) and is_checked(). on_change(function)
is called with the box and whether it is checked now, when the user or the
program changes it.
${CONTAINER}`,

  RadioGroupBox: `A frame around a container, under a title with a radio button in it. It is
a CheckGroupBox whose check box is a radio button: checking one unchecks the
others in its group, and the widgets inside can be used only while it is
the one checked. Its group is the RadioGroupBoxes in the same container; with
set_group(name) it is every RadioGroupBox with that name (get_group), wherever
they are on the screen. It starts unchecked, so call set_checked(True) on the
one to start with. Like a Composite, its children are placed by a layout (vbox
until set_layout), and it has a Composite's methods (see Composite).
set_text(title) and get_text(); set_checked(b) and is_checked();
on_change(function) is called with the box and whether it is checked now,
for the box checked and for the one it unchecks.
${CONTAINER}`,

  Image: `A picture. Image(source) starts it; the source is an http: or https: address
or a data:image/ URI ("" for none); anything else is an error.
set_source(text) and get_source(); set_fit(text) says how the picture fills its
box: "contain" (the default: all of it, keeping its proportions), "cover" (fills
the box, cropping), "fill" (stretches), "none" (its own size) or "scale-down";
set_alt(text) is shown when the picture cannot be. The picture loads in the
background: is_loaded(), get_natural_width() and get_natural_height() (0 until
it has loaded). Until then the Image asks for 100 by 100, afterwards for the
picture's own size, unless set_width / set_height fix one. on_load(function)
and on_error(function) are called with the image, on_click(function) when it is
clicked; register them in the program's top-level code.`,
});

// ---- the methods every widget has --------------------------------------------

/** [title, what they do, [method names]]: every method in COMMON_METHODS belongs to exactly one. */
export const COMMON_GROUPS = Object.freeze([
  ['Names and finding',
    `Give a widget an id and find widgets by id or class from any container above them.
find_by_class("Button") (any case) returns a list. to_json() is the widget and
everything in it as JSON text; save_composite(name) stores that in the
database, to be built again with load_composite on the Viewport.`,
    ['setId', 'getId', 'findById', 'findByClass', 'toJson', 'saveComposite']],
  ['Place and size',
    `Positions and sizes are whole pixels (a size is 0 or more). On the screen or in a
Panel a widget sits where set_left, set_top or set_bounds put it, or fills its
area after fill() (fill() on a Window maximizes it). In a row or column (an
HPanel, a VPanel, a ButtonBar, or a Composite with an hbox or vbox layout)
set_width / set_height fix its size and set_flex shares out the space left
over. get_left, get_top, get_width and get_height say where it is, as laid out.`,
    ['setLeft', 'setTop', 'setWidth', 'setHeight', 'setBounds', 'getLeft', 'getTop', 'getWidth',
      'getHeight', 'setFlex', 'fill', 'setVisible', 'isVisible']],
  ['Colours',
    `Any CSS colour: "red", "#336", "rgb(10, 20, 30)". set_background is the fill and
set_color the text (the outline, for a shape).`,
    ['setBackground', 'setColor']],
  ['The box',
    `From the outside in: the margin (clear space around the widget, inside the area
its parent gives it), the border and the padding (between the border and the
contents). set_margin(n) sets all four sides; set_margin_sides(top, right,
bottom, left) sets each; get_margin() reads the top side. Padding and border
width work the same way, and set_border_color(colour) draws the border. A
Window has none of these.`,
    ['setMargin', 'setMarginSides', 'getMargin', 'setPadding', 'setPaddingSides', 'getPadding',
      'setBorderWidth', 'setBorderWidthSides', 'getBorderWidth', 'setBorderColor', 'getBorderColor']],
  ['Where it is',
    `get_parent() is the container it is in (the Viewport for a widget on the screen),
or None once it has been removed. remove() takes it out of its container; it can
be added again.`,
    ['getParent', 'remove']],
  ['Its place in a Composite\'s layout',
    `These belong to the widget, so they can be set before it is added. A layout
ignores the ones it has no use for. set_edge: dock (north, south, west, east,
center, or "" for the default). set_cell(row, column) and set_span(rows,
columns): grid. set_align(x, y): hbox, vbox, flow and grid; x is "left",
"center" or "right", y is "top", "middle" or "bottom", "" for neither: the
widget takes the size it asks for and sits there instead of stretching.
set_canvas_bounds(left, top, right, bottom, width, height): canvas; each is
"", a number of pixels or a percentage such as "50%".`,
    ['setEdge', 'getEdge', 'setCell', 'getRow', 'getColumn', 'setSpan', 'getRowSpan', 'getColumnSpan',
      'setAlign', 'setCanvasBounds']],
]);

// ---- text ----------------------------------------------------------------------

const KIND = {
  text: 'str', position: 'int', size: 'size', number: 'float', index: 'int', int: 'int',
  boolean: 'bool', widget: 'widget', class: 'class',
};
const RESULT = { text: 'str', int: 'int', number: 'float', boolean: 'bool', widget: 'widget', widgets: 'list of widgets' };

/** An argument's kind as MiniPy writes it: 'size', 'str', 'function(widget, int)'. */
export function kindName(kind) {
  if (kind.startsWith('handler')) {
    const values = kind.split(':').slice(1).map((k) => KIND[k] ?? k);
    return `function(${['widget', ...values].join(', ')})`;
  }
  return KIND[kind] ?? kind;
}

/** A method as a program calls it: set_width(size), get_text() -> str. */
export function signature(method) {
  const result = method.result ? ` -> ${RESULT[method.result] ?? method.result}` : '';
  return `${method.py}(${method.params.map(kindName).join(', ')})${result}`;
}

const rule = (title, char) => `${title}\n${char.repeat(title.length)}`;
const indent = (lines) => lines.map((l) => `  ${l}`).join('\n');

/** The methods of a class that its text lists: its own, or (when it has no common set) all of them. */
function listed(cls) {
  const seen = new Set();
  return (cls.common === COMMON_METHODS ? cls.own : cls.methods).filter((m) => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });
}

/** The documentation of one class, as text. */
export function describeWidget(name) {
  const cls = WIDGET_CLASSES.find((c) => c.name === name);
  if (!cls) throw new Error(`there is no widget class '${name}'`);
  const out = [rule(name, '='), WIDGET_DOCS[name] ?? '', '', 'Make it', indent([`${name}(${cls.params.map(kindName).join(', ')})`]), '', 'Methods'];
  const methods = listed(cls);
  out.push(methods.length ? indent(methods.map(signature)) : '  (none of its own)');
  if (cls.common === COMMON_METHODS) {
    out.push('', 'It also has the common methods of every widget (see Common methods).');
  }
  return out.join('\n');
}

/** The methods every widget has, in groups, as text. */
export function describeCommon() {
  const byName = new Map(COMMON_METHODS.map((m) => [m.name, m]));
  const out = [rule('Common methods', '='), 'Every widget has these (except the Board, the Canvas and the Physics, which have\nnone; the Viewport has only the ones under Names and finding).'];
  for (const [title, text, names] of COMMON_GROUPS) {
    out.push('', rule(title, '-'), text, '', indent(names.map((n) => signature(byName.get(n)))));
  }
  return out.join('\n');
}

const INTRO = `${rule('Widgets', '=')}
Every widget a program can make, with the methods it has. Programs are written
in MiniPy: call a class to make a widget, then call methods on it.

  label = Label("Hello")
  label.set_width(120)
  button = Button("Go")
  def go(button):
      label.set_text("Went")
  button.on_click(go)

Arguments are described by their kind: str (any value, shown as text), int, size
(a whole number of 0 or more), float, bool, widget, class (a class name such as
"Button") and function (an event handler: it is called with the widget, then the
values the event brings). Positions and sizes are in pixels; indexes count from
0. A method that sets something returns None. Widgets are objects: two names for
the same widget are equal under "is".`;

/** The classes, in alphabetical order. */
export const WIDGET_NAMES = Object.freeze(WIDGET_CLASSES.map((c) => c.name).sort((a, b) => a.localeCompare(b)));

/** All of it: the introduction, the common methods and every class. */
export function describeAll() {
  return [INTRO, describeCommon(), ...WIDGET_NAMES.map(describeWidget)].join('\n\n\n');
}

/** What the Help window lists: [{ label, text }], "All widgets" first. */
export function helpEntries() {
  return [
    { label: 'All widgets', text: describeAll() },
    { label: 'Common methods', text: describeCommon() },
    ...WIDGET_NAMES.map((name) => ({ label: name, text: describeWidget(name) })),
  ];
}
