# FastBlip GUI Widgets

FastBlip has two layers of widgets, and it helps to keep them apart:

1. **The UI toolkit** — the JavaScript classes the FastBlip IDE itself is
   built from (Viewport, Windows, panels, menus…; see `docs/widgets.txt`).
2. **Program widgets** — the same toolkit, offered to BLIPs as objects.
   Every general-purpose class is available in both languages: a program
   makes one with `New` (`Dim label = New Label("Hello")`) and sets its
   properties through methods (`label.setWidth(100)`).

## 1. Current program widgets

### Where they appear

A program's widgets live on its **AppScreen**: a text panel that receives
the program's `Print` output, with a transparent layer on top holding the
widgets. An AppScreen is the content of a **Launch window** (a console's
*Launch → Desktop / Mobile* menu; Mobile is a fixed 360 × 640 phone screen)
and of the full-page **`?run=<name>`** app. In a plain console or at the
command line there is no screen, and making a widget reports a clear
runtime error instead.

### The classes

| Class | Crumb / MiniPy | What it is |
|---|---|---|
| Label | `New Label(text)` / `Label(text)` | A line of text; clickable |
| Button | `New Button(text)` / `Button(text)` | A push button |
| Menu | `New Menu(text)` / `Menu(text)` | A button that opens a list of items, each calling a handler |
| Spacer | `New Spacer()` / `Spacer()` | Takes up the free space in a row or column |
| Panel | `New Panel()` / `Panel()` | Children placed where the program puts them |
| HPanel, VPanel | `New HPanel()` / `HPanel()` | A row / column that lays its children out (fixed size or flex weight) |
| ButtonBar | `New ButtonBar()` / `ButtonBar()` | A row of buttons; `addButton(text)` |
| HSplitPanel, VSplitPanel | `New HSplitPanel()` / `HSplitPanel()` | Two panes with a draggable divider |
| TabPanel | `New TabPanel()` / `TabPanel()` | Pages chosen by tabs |
| Window | `New Window(title)` / `Window(title)` | A floating window with content and a button bar |
| TextPanel | `New TextPanel(text)` / `TextPanel(text)` | Multi-line text the user edits |
| MonacoPanel | `New MonacoPanel(text, language)` / `MonacoPanel(...)` | A code editor with highlighting |
| ListPanel | `New ListPanel()` / `ListPanel()` | A list to pick a row from |

Every widget can be placed and sized (`setLeft` … `setBounds`, `getLeft` …),
given a flex weight (`setFlex`), made to fill its area (`fill`), shown or
hidden, coloured (`setBackground`, `setColor`), asked for its container
(`getParent`) and taken out of it (`remove`). The per-class methods and the
exact rules are in spec section 10.1; MiniPy spells every method in
snake_case (`get_selected_index`, `on_click`).

Not offered to programs: the singletons (Viewport, Navbar, StatusBar,
Transcript and Process windows), the IDE's own windows and the panels made
for them (consoles, database windows, RecordPanel, OutputPanel), and the
Board and Canvas placeholders.

### How a program uses them

```vb
Dim page = New VPanel()
page.fill()
Dim toolbar = New HPanel()
page.add(toolbar)
Dim addButton = New Button("Add")
toolbar.add(addButton)
Dim list = New ListPanel()
list.setFlex(1)
page.add(list)
Dim shown = New Label("")
page.add(shown)
addButton.onClick("AddItem")
list.onSelect("Picked")

Sub AddItem()
  list.addItem("Item " & list.getCount())
End Sub

Sub Picked(w, index)
  shown.setText("Picked " & w.getItem(index))
End Sub
```

`examples/widget-tour.crumb` and `examples/widget-tour.py` use most of the
classes.

### The Viewport, ids and saved screens

The topmost GUI object is the **Viewport**, a singleton: `New Viewport()`
(MiniPy `Viewport()`) always gives the program its own screen, and every
widget on it is its child. Any widget can be named with `setId("total")`,
and any container — the Viewport above all — can find what is inside it
with `findById("total")` or `findByClass("Button")` (an Array / list).

The Viewport can be written out as JSON (`vp.toJson()`), rebuilt from it
(`vp.fromJson(text)`), and kept in the database: `vp.save("order-form")`,
`vp.load("order-form")`. The JSON holds the layout — classes, ids, text,
sizes, list and menu items, tabs, windows — and the *names* of the event
handlers, which are looked up in the loading program. That separates a
screen from its code: one program (or, later, a visual designer) can build
and save a screen, and another can load it, find its widgets by id, and
supply the Subs it names. The server needs a `viewports` table; see
`docs/viewports-server.md`.

**Layout.** A new widget appears at the top left of the screen at its
class's default size. `add` (and `setContent`, `setFirst`, `addTab`…) moves
it into a container. On the screen and in a Panel a widget sits where the
program puts it, or fills the area after `fill()`; in an HPanel, VPanel or
ButtonBar the container places it, using the size the program set, else its
flex share, else its natural size. Windows float above everything.

**The event model.** Top-level code runs first and builds the screen. If the
program has registered any handler (`onClick`, `onSelect`, `onChange`,
`onSubmit`, `onClose`, a menu item), it does not finish when the top-level
code ends: its process goes to `waiting`. Each event queues a call; the
scheduler wakes the process and runs the handler as an ordinary call on the
same VM, then the process waits again — until Reset, the window closes, or
it is killed. A handler takes up to two arguments: the widget, and the
event's value (a row or tab index, the new text, the item's label).
Handlers run one at a time, between other processes' turns, so there are no
races within a program.

**How it is built.** Crumb has a `New` keyword and `.` for method calls,
compiled to two opcodes, `NEW_OBJECT` and `CALL_METHOD`; MiniPy already had
calls and attributes, so the classes are built-in callables and the methods
are found through `GET_ATTR`. Both languages share one table of classes and
methods (`WIDGET_CLASSES` in `src/vm/runtime/widgets.js`): each method's two
names, its argument kinds and its result kind. The value a program holds is
a `Widget` object with the host's id for the widget.

**The host interface.** The VM knows nothing about the DOM. It talks to a
*widget host* with four methods: `create(className, args)`, `has(id)`,
`classOf(id)` and `call(id, method, args)`. In the browser that is
`ProgramWidgetHost` (`src/ui/program-widgets.js`), which drives the real
toolkit classes. Adding a class or a method means an entry in the shared
table and a case in the host — the VM, the compilers and the scheduler do
not change.

### Current limitations

- No single-line text box, check box, radio group, drop-down, slider,
  progress bar or image yet (see below).
- Programs cannot declare classes of their own (Crumb), and objects have
  methods but no fields: properties are set and read through methods.
- A program cannot ask how big its screen is, or hear when it is resized;
  `fill()` and rows and columns cover most layouts.
- No timers, key events or mouse positions.
- The Board and Canvas output tabs in consoles are placeholders.

## 2. Widgets to implement next

Every new widget is a class with methods, like the ones above: Crumb
`New TextBox("")` / MiniPy `TextBox("")`, and Crumb `camelCase` methods
with MiniPy `snake_case` twins (`tb.onChange` / `tb.on_change`). Only the
Crumb spelling is shown below.

### Phase 1 — make apps interactive

| Widget / feature | Proposed API | Why |
|---|---|---|
| **TextBox** (single line) | `New TextBox(text)`; `getText()`; `onChange("Sub")`, `onEnter("Sub")` | Forms: a TextPanel is multi-line. |
| **Screen size** | `ScreenWidth()`, `ScreenHeight()`, `OnResize("Sub")` — built-ins, since the screen is not an object a program makes | Lets one program lay itself out for desktop and phone. |
| **Timer** | `Dim t = New Timer(ms)`, `t.onTick("Sub")`, `t.stop()` | Animation, clocks, polling — without a busy `Sleep` loop. |
| **MsgBox / InputBox** | `MsgBox(text)`, `InputBox(prompt)` — block the process until answered | Familiar to Basic users; implements the spec's missing `Input` on the existing `waiting` mechanism. |

### Phase 2 — standard form controls

| Widget | Notes |
|---|---|
| **CheckBox** | `isChecked()` / `setChecked(b)`; `onChange`. |
| **RadioGroup** | One widget holding several options; `getSelected()` returns the index. |
| **ComboBox / DropDown** | A compact ListPanel. |
| **Slider** | Min, max, value; `onChange`. |
| **ProgressBar** | Value 0–100; pairs well with `Fetch`. |
| **Image** | `New Image(url)`; clickable. |

### Phase 3 — more containers

| Container | Behaviour |
|---|---|
| **ScrollPanel** | A scrollable area larger than the screen — long forms, lists of cards, maps. |
| **Navbar / StatusBar for apps** | App-level chrome on a `?run=` page: a title and menus at the top, messages at the bottom. |
| **Modal dialogs** | A Window that blocks the rest of the screen until closed. |

### Phase 4 — graphics

| Widget | Notes |
|---|---|
| **Canvas** | Finish the Canvas tab and make it a program widget: `canvas.line(...)`, `rect`, `circle`, `text`, `fill`, `clear`, `onMouse`. Draw commands queued per slice and flushed on the browser's animation frame. |
| **Board** | Finish the Board tab as a grid of cells (games: tic-tac-toe, chess, Sudoku, life): `board.setCell(r, c, value)`, `onCellClick`. |
| **Sprite** | Positioned images on a canvas for simple games. |
| **Chart** | Bar/line charts from an array — useful for data apps built on `Fetch`. |

## 3. Design principles for new widgets

1. **Objects in the program, ids at the host.** A program creates a widget
   as an object (`New Label("Hello")`) and sets its properties through
   methods (`label.setWidth(100)`). The object holds the host's id; the host
   owns the DOM. This keeps the VM portable (a future native or canvas host
   needs only the same interface) and keeps untrusted programs away from the
   page.
2. **One event model.** Every event (`onClick`, `onChange`, `onSelect`,
   timers, resize) queues an event and wakes the waiting process; handlers
   run as ordinary calls, one at a time.
3. **Both languages, same meaning.** Specify each class and method once, in
   the shared table, with a Crumb (`camelCase` method, Sub name as a string)
   and a MiniPy (`snake_case` method, function value) spelling, as `onClick`
   / `on_click` already are.
4. **Theme-aware.** Widgets use the `--cr-*` theme variables, so a BLIP looks
   right in the Classic, Smalltalk and Apple themes without extra code.
5. **Mobile first.** Touch-sized defaults and automatic layout, so the same
   BLIP works at `?run=` on a phone and in a desktop window.
