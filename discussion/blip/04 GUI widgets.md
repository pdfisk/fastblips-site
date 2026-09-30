# FastBlip GUI Widgets

FastBlip has two layers of widgets, and it helps to keep them apart:

1. **Program widgets** — objects a BLIP creates for itself with `New`
   (`Dim label = New Label("Hello")`, then `label.setWidth(100)`). Today:
   **Button** and **Label**.
2. **The UI toolkit** — the JavaScript classes the FastBlip IDE itself is
   built from (Viewport, Windows, panels, menus…; see `docs/widgets.txt`).
   These are not yet available to programs, but they are the obvious
   foundation for the next program widgets.

## 1. Current program widgets

### Where they appear

A program's widgets live on its **AppScreen**: a text panel that receives
the program's `Print` output, with a transparent layer on top holding the
widgets. An AppScreen is the content of a **Launch window** (a console's
*Launch → Desktop / Mobile* menu; Mobile is a fixed 360 × 640 phone screen)
and of the full-page **`?run=<name>`** app. In a plain console or at the
command line there is no screen, and a widget built-in reports a clear
runtime error instead.

### Widgets are objects

A widget is created as an object, and its properties are set by calling
methods on it:

```vb
Dim label = New Label("Hello")
label.setWidth(100)
```

```python
label = Label("Hello")
label.set_width(100)
```

| Crumb | MiniPy | Purpose |
|---|---|---|
| `New Button(text)` | `Button(text)` | Create a button (top left, 100 × 32) |
| `New Label(text)` | `Label(text)` | Create a label (opaque, left-aligned text; top left, 100 × 24) |
| `w.setText(text)` / `w.getText()` | `w.set_text(text)` / `w.get_text()` | Change / read the text |
| `w.setLeft(n)` `setTop` `setWidth` `setHeight` | `w.set_left(n)` … | Move or resize along one edge |
| `w.getLeft()` `getTop` `getWidth` `getHeight` | `w.get_left()` … | Read the position or size |
| `w.setBounds(left, top, width, height)` | `w.set_bounds(...)` | Move and resize in one call |
| `w.onClick("SubName")` | `w.on_click(handler)` | Call a procedure on every click; it may take the clicked widget as its one argument |

Positions and sizes are CSS pixels from the top left of the screen. Crumb
names are case-insensitive, and class names do not clash with variables, so
`Dim label = New Label(...)` is fine. Go and Reset remove all of a program's
widgets.

### How a program uses them

```vb
Dim clicks = 0
Dim counter = New Label("Clicks: 0")
counter.setBounds(20, 50, 240, 24)
Dim button = New Button("Click me")
button.setBounds(20, 84, 120, 32)
button.onClick("Clicked")

Sub Clicked()
  clicks = clicks + 1
  counter.setText("Clicks: " & clicks)
End Sub
```

**The event model.** Top-level code runs first and builds the screen. If the
program has registered any `onClick` handler, it does not finish when the
top-level code ends: its process goes to `waiting`. Each click queues an
event; the scheduler wakes the process and runs the handler as an ordinary
call on the same VM, then the process waits again — until Reset, the window
closes, or it is killed. Handlers run one at a time, between other
processes' turns, so there are no races within a program.

**How it is built.** Crumb has a `New` keyword and `.` for method calls,
compiled to two opcodes, `NEW_OBJECT` and `CALL_METHOD`; MiniPy already had
calls and attributes, so `Label` and `Button` are built-in callables and the
methods are found through `GET_ATTR`. Both languages share one table of
classes and methods (`src/vm/runtime/widgets.js`) and one value, a `Widget`
object that holds the host's id for the widget and remembers its box.

**The host interface.** The VM knows nothing about the DOM. It talks to a
*widget host* with six methods: `create(kind, text, left, top, width,
height)`, `has`, `setText`, `getText`, `setBounds`, `onClick`. Adding a
widget kind means (a) a host implementation in the AppScreen and (b) an
entry in the shared class table, plus any new methods — the VM, the
compilers and the scheduler do not change.

### Current limitations

- Only two classes; no way to read user-typed text (no input box).
- Programs cannot declare classes of their own (Crumb), and objects have
  methods but no fields: properties are set and read through methods.
- Absolute positioning only — layouts do not adapt between desktop and phone,
  and a program cannot ask how big its screen is.
- No remove, hide/show, enable/disable, colour or font control.
- Only one event (click); no change, key, timer or resize events.
- The Board and Canvas output tabs in consoles are placeholders.

## 2. Widgets to implement next

Ordered by how much they unlock. Every new widget is a class with methods,
like Label and Button: Crumb `New TextBox("")` / MiniPy `TextBox("")`, and
Crumb `camelCase` methods with MiniPy `snake_case` twins (`tb.onChange` /
`tb.on_change`). Only the Crumb spelling is shown below.

### Phase 1 — make apps interactive

| Widget / feature | Proposed API | Why |
|---|---|---|
| **TextBox** (single line) | `New TextBox(text)`; `getText()`; `onChange("Sub")`, `onEnter("Sub")` | The biggest gap: user input. |
| **Common methods** | `setVisible(b)`, `setEnabled(b)`, `remove()`, `setStyle("color", "red")` on every widget | Basic control of any widget. |
| **Screen size** | `ScreenWidth()`, `ScreenHeight()`, `OnResize("Sub")` — built-ins, since the screen is not an object a program makes | Lets one program lay itself out for desktop and phone. |
| **Timer** | `Dim t = New Timer(ms)`, `t.onTick("Sub")`, `t.stop()` | Animation, clocks, polling — without a busy `Sleep` loop. |
| **MsgBox / InputBox** | `MsgBox(text)`, `InputBox(prompt)` — block the process until answered | Familiar to Basic users; implements the spec's missing `Input` on the existing `waiting` mechanism. |

### Phase 2 — standard form controls

| Widget | Notes |
|---|---|
| **CheckBox** | `isChecked()` / `setChecked(b)`; `onChange`. |
| **RadioGroup** | One widget holding several options; `getSelected()` returns the index. |
| **ListBox** | Built on the existing `ListPanel`: `addItem`, `removeItem`, `getSelected`, `onSelect`; keyboard navigation already exists. |
| **ComboBox / DropDown** | A compact ListBox. |
| **Slider** | Min, max, value; `OnChange`. |
| **ProgressBar** | Value 0–100; pairs well with `Fetch`. |
| **Multi-line TextArea** | Built on `TextPanel`, optionally `MonacoPanel` for code-editing apps. |
| **Image** | `New Image(url)`; clickable. |

### Phase 3 — containers and layout

Absolute positioning is fine for a first app but breaks on phones. The IDE
already has a layout system that programs should be able to use:

| Container | Based on | Behaviour |
|---|---|---|
| **Panel** | `Panel` | A group of widgets moved/hidden together; children positioned relative to it. |
| **HPanel / VPanel** (row / column) | `HPanel`, `VPanel` | Children laid out automatically, each with a fixed size or flex weight: `row.add(button)`, no coordinates needed. |
| **ScrollPanel / Viewport** | new | A scrollable area larger than the screen — long forms, lists of cards, maps. |
| **TabPanel** | `TabPanel` | Pages chosen by tabs; ideal for multi-screen phone apps. |
| **SplitPanel** | `HSplitPanel`, `VSplitPanel` | Two resizable panes (master/detail). |
| **Window / Dialog** | `Window` | A floating window inside a desktop app; modal dialogs. |
| **Navbar / StatusBar** | `Navbar`, `StatusBar` | App-level chrome: a title and menu at the top, messages at the bottom. |
| **Menu** | `Menu` | Pull-down menus with items that call a Sub. |

Proposed rule: a container is an object too, and `container.add(widget)`
puts a widget in it. In a container that lays out automatically, the
widget's width and height are treated as a preferred size and its position
is ignored; a widget in no container is placed absolutely on the screen as
today. Existing programs keep working.

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
