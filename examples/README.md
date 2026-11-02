# Examples

Runnable BlipPy programs. Open one in a Python console and run it from the
console's **Launch** menu (a desktop window, or a phone-sized one for the
`mobile-` examples), or load it as an app. The ones that draw (`canvas-demo`,
`animated-cars`, the `physics-` set, `tic-tac-toe`) also work in a console's
output tabs.

Every widget in the toolkit is made in at least one of them. Each example
starts with a comment saying which widgets it shows and what they do, and gives
the widgets that respond an id (`set_id`), so a test can find them.
`test/widget-examples.test.js` runs each of them on the real widget host and
uses it the way a person would: it clicks, types, picks and swipes, then checks
what the widgets say. It also fails if a widget class has no example or an
example is missing from this file.

## The examples

| Example | What it shows | Widgets |
|---|---|---|
| `widget-tour.py` | The first tour: a toolbar, a list beside a text box, a window | HSplitPanel, ListPanel, TextPanel, Window |
| `buttons-and-menus.py` | Buttons that switch off, a button with a menu behind an arrow, drop-down menus that change, a row of buttons, a question in a window | Button, SplitButton, Menu, ButtonBar, Window, Spacer |
| `form-fields.py` | A sign-up form that checks itself: text, secret and multi-line fields, a drop-down, a choice of plan, an optional newsletter | TextField, PasswordField, TextArea, SelectBox, RadioGroupBox, CheckGroupBox, Composite |
| `lists-and-editors.py` | A task list to add to, rename and trim; a notes box that counts; a code editor that can be locked | ListPanel, TextField, TextPanel, MonacoPanel |
| `panels-and-rows.py` | Free placement, rows and columns that share space, margins and borders, moving a widget between containers | Panel, HPanel, VPanel, Spacer |
| `splits-and-tabs.py` | Dividers the user drags, tabs and a list that show the same choice | HSplitPanel, VSplitPanel, TabPanel, ListPanel |
| `windows.py` | Floating windows opened and closed from code, hearing a close, maximizing, painting the screen | Window, Viewport |
| `shapes-and-images.py` | Shapes that change when clicked; pictures that load, fail and fit their box | Ellipse, RoundedRect, Image, SelectBox |
| `viewport-and-finding.py` | Finding widgets by id and class; saving the screen as JSON and going back to it | Viewport |
| `layout-gallery.py` | The eight layouts, one to a tab | Composite, TabPanel |
| `layouts-tour.py` | The layouts working together in an app, and a Stack | Composite, Stack |
| `mobile-navigation.py` | A phone app's pages: a bar whose title and buttons follow the page | NavigationBar, Stack, ListPanel, TextArea, TextField |
| `mobile-carousel.py` | A photo gallery to swipe through, with dots | Carousel, Image, NavigationBar |
| `mobile-drawer.py` | A drawer whose menu chooses the edge it slides in from; it closes after 5 seconds, on a tap outside, or on Close | Drawer, NavigationBar, Button |
| `mobile-app.py` | A whole small app: introduction, notes, settings and a menu | NavigationBar, Stack, Drawer, Carousel, Image, CheckGroupBox, RadioGroupBox, SelectBox, ListPanel, TextField |
| `tic-tac-toe.py` | A two-player game on a board of cells | Board |
| `canvas-demo.py` | A bar chart, then a turning 3D scene | Canvas |
| `animated-cars.py` | Small drawing classes combined into bigger ones, animated | Canvas |
| `physics-balls.py` | Bouncing balls | Physics |
| `physics-shapes.py` | Many kinds of shape in one world | Physics |
| `physics-gravity.py` | Gravity that follows your clicks | Physics |
| `physics-pyramid.py` | Knocking down a pyramid of boxes | Physics |
| `physics-bumpers.py` | A pinball table; hearing collisions | Physics |
| `physics-composites.py` | Shapes joined into rigid bodies | Physics |
| `physics-tower.py` | A tower that comes apart | Physics |
| `physics-machine.py` | A machine of animated bodies | Physics |
| `api-tour.py` | Twelve free web APIs with `fetch()` (no widgets) | |

## Where each widget is shown

| Widget | Examples |
|---|---|
| Viewport | `viewport-and-finding.py`, `windows.py`, `mobile-app.py` |
| Label, Button, Spacer | nearly all of them; `buttons-and-menus.py` is about buttons |
| Menu, SplitButton, ButtonBar | `buttons-and-menus.py` |
| Panel, HPanel, VPanel | `panels-and-rows.py` |
| HSplitPanel, VSplitPanel, TabPanel | `splits-and-tabs.py` |
| Window | `windows.py`, `buttons-and-menus.py`, `widget-tour.py` |
| TextPanel, MonacoPanel, ListPanel | `lists-and-editors.py` |
| TextField, PasswordField, TextArea | `form-fields.py` |
| SelectBox, CheckGroupBox, RadioGroupBox | `form-fields.py` |
| Composite, Stack | `layout-gallery.py`, `layouts-tour.py` |
| Ellipse, RoundedRect, Image | `shapes-and-images.py` |
| NavigationBar, Carousel, Drawer | `mobile-navigation.py`, `mobile-carousel.py`, `mobile-drawer.py`, `mobile-app.py` |
| Board | `tic-tac-toe.py` |
| Canvas | `canvas-demo.py`, `animated-cars.py` |
| Physics | the `physics-` examples |

## Writing your own

- A handler is a function of the program's own (a widget's method will not do);
  it takes as many of (widget, value) as it wants, so `def go():` and
  `def picked(widget, index):` both work.
- A function cannot assign to a module-level name, so state a handler changes
  lives in a dict or a list, or in the widgets themselves.
- An event is delivered once the handler that caused it has finished, so
  selecting a row inside a handler calls the list's `on_select` afterwards.
- Help > Widget Documentation lists every widget and its methods.
