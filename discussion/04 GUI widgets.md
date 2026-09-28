# FastBlip GUI Widgets

FastBlip has two layers of widgets, and it helps to keep them apart:

1. **Program widgets** — what a BLIP creates for itself with built-ins such
   as `AddButton`. Today: **Button** and **Label**.
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

### The built-ins

| Crumb | MiniPy | Purpose |
|---|---|---|
| `AddButton(text, left, top, width, height)` | `add_button(...)` | Create a button; returns its id |
| `AddLabel(text, left, top, width, height)` | `add_label(...)` | Create a label (opaque, left-aligned text); returns its id |
| `SetText(w, text)` | `set_text(w, text)` | Change a widget's text |
| `GetText(w)` | `get_text(w)` | Read a widget's text |
| `SetBounds(w, left, top, width, height)` | `set_bounds(...)` | Move and/or resize a widget |
| `OnClick(w, "SubName")` | `on_click(w, handler)` | Call a procedure on every click; it may take the clicked widget as its one argument |

Positions and sizes are CSS pixels from the top left of the screen. Ids are
whole numbers from 1. Go and Reset remove all of a program's widgets.

### How a program uses them

```vb
Dim clicks = 0
Dim counter = AddLabel("Clicks: 0", 20, 50, 240, 24)
Dim button  = AddButton("Click me", 20, 84, 120, 32)
OnClick(button, "Clicked")

Sub Clicked()
  clicks = clicks + 1
  SetText(counter, "Clicks: " & clicks)
End Sub
```

**The event model.** Top-level code runs first and builds the screen. If the
program has registered any `OnClick` handler, it does not finish when the
top-level code ends: its process goes to `waiting`. Each click queues an
event; the scheduler wakes the process and runs the handler as an ordinary
call on the same VM, then the process waits again — until Reset, the window
closes, or it is killed. Handlers run one at a time, between other
processes' turns, so there are no races within a program.

**The host interface.** The VM knows nothing about the DOM. It talks to a
*widget host* (`src/vm/runtime/widgets.js`) with six methods: `create(kind,
text, left, top, width, height)`, `has`, `setText`, `getText`, `setBounds`,
`onClick`. Adding a widget kind means (a) a host implementation in the
AppScreen and (b) a built-in in each language — the VM and scheduler do
not change.

### Current limitations

- Only two kinds; no way to read user-typed text (no input box).
- Absolute positioning only — layouts do not adapt between desktop and phone,
  and a program cannot ask how big its screen is.
- No remove, hide/show, enable/disable, colour or font control.
- Only one event (click); no change, key, timer or resize events.
- The Board and Canvas output tabs in consoles are placeholders.

## 2. Widgets to implement next

Ordered by how much they unlock. Every entry needs a Crumb and a MiniPy
spelling; both are shown once here as `Crumb / python`.

### Phase 1 — make apps interactive

| Widget / feature | Proposed API | Why |
|---|---|---|
| **TextBox** (single line) | `AddTextBox(text, l, t, w, h)` / `add_text_box`; `GetText`; `OnChange(w, "Sub")`, `OnEnter` | The biggest gap: user input. |
| **Common properties** | `SetVisible`, `SetEnabled`, `RemoveWidget`, `SetStyle(w, "color", "red")` | Basic control of any widget. |
| **Screen size** | `ScreenWidth()`, `ScreenHeight()`, `OnResize("Sub")` | Lets one program lay itself out for desktop and phone. |
| **Timer** | `AddTimer(ms, "Sub")` / `add_timer`, `StopTimer` | Animation, clocks, polling — without a busy `Sleep` loop. |
| **MsgBox / InputBox** | `MsgBox(text)`, `InputBox(prompt)` — block the process until answered | Familiar to Basic users; implements the spec's missing `Input` on the existing `waiting` mechanism. |

### Phase 2 — standard form controls

| Widget | Notes |
|---|---|
| **CheckBox** | `Checked(w)` / `SetChecked`; `OnChange`. |
| **RadioGroup** | One widget holding several options; `Selected(w)` returns the index. |
| **ListBox** | Built on the existing `ListPanel`: `AddItem`, `RemoveItem`, `Selected`, `OnSelect`; keyboard navigation already exists. |
| **ComboBox / DropDown** | A compact ListBox. |
| **Slider** | Min, max, value; `OnChange`. |
| **ProgressBar** | Value 0–100; pairs well with `Fetch`. |
| **Multi-line TextArea** | Built on `TextPanel`, optionally `MonacoPanel` for code-editing apps. |
| **Image** | `AddImage(url, l, t, w, h)`; clickable. |

### Phase 3 — containers and layout

Absolute positioning is fine for a first app but breaks on phones. The IDE
already has a layout system that programs should be able to use:

| Container | Based on | Behaviour |
|---|---|---|
| **Panel** | `Panel` | A group of widgets moved/hidden together; children positioned relative to it. |
| **HPanel / VPanel** (row / column) | `HPanel`, `VPanel` | Children laid out automatically, each with a fixed size or flex weight. `AddButton(..., parent)` with no coordinates. |
| **ScrollPanel / Viewport** | new | A scrollable area larger than the screen — long forms, lists of cards, maps. |
| **TabPanel** | `TabPanel` | Pages chosen by tabs; ideal for multi-screen phone apps. |
| **SplitPanel** | `HSplitPanel`, `VSplitPanel` | Two resizable panes (master/detail). |
| **Window / Dialog** | `Window` | A floating window inside a desktop app; modal dialogs. |
| **Navbar / StatusBar** | `Navbar`, `StatusBar` | App-level chrome: a title and menu at the top, messages at the bottom. |
| **Menu** | `Menu` | Pull-down menus with items that call a Sub. |

Proposed rule: every `Add…` built-in takes an optional **parent** (a
container id). With a parent that lays out automatically, the coordinates
are omitted or treated as a preferred size; without one, the widget is
placed absolutely on the screen as today. Existing programs keep working.

### Phase 4 — graphics

| Widget | Notes |
|---|---|
| **Canvas** | Finish the Canvas tab and make it a program widget: `Line`, `Rect`, `Circle`, `Text`, `Fill`, `Clear`, `OnMouse`. Draw commands queued per slice and flushed on the browser's animation frame. |
| **Board** | Finish the Board tab as a grid of cells (games: tic-tac-toe, chess, Sudoku, life): `SetCell(r, c, value)`, `OnCellClick`. |
| **Sprite** | Positioned images on a canvas for simple games. |
| **Chart** | Bar/line charts from an array — useful for data apps built on `Fetch`. |

## 3. Design principles for new widgets

1. **Id-based, host-owned.** Programs hold numeric ids; the host owns the DOM.
   This keeps the VM portable (a future native or canvas host needs only the
   same interface) and keeps untrusted programs away from the page.
2. **One event model.** Every event (`OnClick`, `OnChange`, `OnSelect`,
   timers, resize) queues an event and wakes the waiting process; handlers
   run as ordinary calls, one at a time.
3. **Both languages, same meaning.** Specify each built-in once, with a
   Crumb (`PascalCase`, Sub name as a string) and a MiniPy (`snake_case`,
   function value) spelling, as `OnClick` / `on_click` already are.
4. **Theme-aware.** Widgets use the `--cr-*` theme variables, so a BLIP looks
   right in the Classic, Smalltalk and Apple themes without extra code.
5. **Mobile first.** Touch-sized defaults and automatic layout, so the same
   BLIP works at `?run=` on a phone and in a desktop window.
