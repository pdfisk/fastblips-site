# Crumb — language specification, draft v0.1

A small imperative language with Visual Basic's surface syntax. One statement per line,
blocks closed with `End`, four value types plus arrays and widget objects, dynamically
typed, no coercion.
Target implementation: recursive-descent parser + bytecode compiler and VM.

Published spec (styled): https://claude.ai/code/artifact/cb906b5d-57c8-4a62-ba25-ba9618798afa

## 1. Design rules

1. **A line is a statement.** No statement separator (`:`), no line continuation (`_`).
2. **Nothing is implicit.** Variables must be declared, conditions must be Boolean, calls
   need parentheses, a `Function` must `Return`.
3. **One numeric type** — IEEE 754 double. No `Integer`/`Long`/`Single`, no sigils (`x%`, `s$`).
4. **If it can be a library function, it is not syntax.** Only `Print` and its twin
   `Transcript` are output statements; everything else is a built-in (§10).

## 2. Lexical structure

- UTF-8. Whitespace insignificant except newline, which terminates a statement.
- Keywords and identifiers **case-insensitive**; string contents are not.
- Comment: `'` to end of line. No block comment, no `REM`.
- IDENT: `[A-Za-z_][A-Za-z0-9_]*`
- NUMBER: `digits [ . digits ] [ (e|E) [+|-] digits ]`
- STRING: double-quoted, `""` is an escaped quote. No escape sequences, no multiline.
- OPERATOR: `+ - * / \ ^ & = <> <= >= < > ( ) , .` — `.` is member access (§10.1)
- 25 reserved words (§12).

## 3. Values and types

| Type | Notes |
|---|---|
| Number | IEEE 754 double, the only numeric type; prints without decimal point when integral |
| String | Immutable; built-ins index from **1** |
| Boolean | `True` / `False`; the only type a condition accepts |
| Nothing | Value of a bare `Dim`, result of a `Sub`; only `=` / `<>` accept it |
| Array | Fixed-length, reference value (§9) |
| Object | A widget made with `New`: a `Label` or a `Button` (§10.1). Reference value; its type name is its class |

**No coercion, one exception:** `+` requires two Numbers; `&` converts both operands to
String. `"a" + 1` is an error, `"a" & 1` is `"a1"`.

## 4. Program structure

Sequence of lines: statement, procedure declaration, or empty. Two-pass load — pass 1
collects all `Sub`/`Function` (so a procedure may be called before its declaration line),
pass 2 runs top-level statements in source order. No entry point, no modules, no nesting
of procedures.

## 5. Declarations and scope

```
Dim total                 ' holds Nothing
Dim greeting = "hello"
Dim scores(9)             ' indices 0..9
```

Exactly two scopes: **module** (top-level `Dim`, visible and assignable everywhere) and
**procedure** (parameters + every `Dim` in the body; shadows module names for the whole
procedure). Blocks do not scope. Re-declaration in one scope is an error; assigning an
undeclared name is an error (`Option Explicit` always on).

## 6. Statements

- **Assignment** — `lvalue = expression`, lvalue is `name` or `name(index)`. `=` is
  assignment only as the top-level operator of an assignment statement; elsewhere it is
  equality.
- **Print** — zero or more comma-separated expressions, space-separated, then newline.
  Values converted as by `Str`. Bare `Print` writes a blank line.
- **Transcript** — exactly like `Print`, but the line goes to the transcript (§10).
  `Transcript` stays a built-in name, not a reserved word: only at the start of a
  statement does it take `Print`'s syntax, so `Transcript("x")` still works.
- **If** — block form with `ElseIf`/`Else`/`End If`; single-line form `If c Then stmt`
  (one statement, no `Else`). Condition must be Boolean — no truthiness.
- **While** — `While cond … End While`.
- **For** — `For i = a To b [Step s] … Next`. Start/limit/step evaluated **once** before
  the first iteration. Undeclared loop variable is implicitly declared in the enclosing
  scope and keeps its last value. `Next` takes no name.
- **Exit** — `Exit For`, `Exit While`; nearest enclosing loop of that kind. No `Continue`.
- **Return** — expression required in a `Function`, forbidden in a `Sub`.
- **Call** — `Name(args)` as a statement; parentheses always required, even for zero args.
- **Method call** — `object.method(args)` as a statement (§10.1), e.g. `label.setWidth(100)`;
  parentheses always required. A method call cannot be assigned to.

## 7. Procedures

```
Sub Greet(name, times)
  For i = 1 To times
    Print "Hello, " & name
  Next
End Sub

Function Area(w, h)
  Return w * h
End Function
```

Fixed arity. No optional/named args, no `ParamArray`, no overloading, no `ByRef` —
arguments pass by value (an array argument copies the reference, so element writes are
visible to the caller). Recursion allowed. Falling off `End Sub` returns `Nothing`;
falling off `End Function` is a **runtime error**. Procedures and variables share one
namespace.

## 8. Operator precedence (tightest first)

| Lvl | Operators | Assoc | Operands → result |
|---|---|---|---|
| 1 | `()` `f(…)` `a(i)` `New C(…)` `.m(…)` | left | grouping, call, index, object creation, method call |
| 2 | `^` | right | Num, Num → Num |
| 3 | unary `-` `+` | right | Num → Num |
| 4 | `*` `/` `\` `Mod` | left | Num, Num → Num; `\` truncates toward zero; `Mod` takes the left sign |
| 5 | `+` `-` | left | Num, Num → Num **only** |
| 6 | `&` | left | Any, Any → Str |
| 7 | `=` `<>` `<` `<=` `>` `>=` | left | T, T → Bool; same type both sides; Strings by code point |
| 8 | `Not` | right | Bool → Bool |
| 9 | `And` | left | Bool, Bool → Bool, short-circuit |
| 10 | `Or` | left | Bool, Bool → Bool, short-circuit |

Consequences: `Not x = y` parses as `Not (x = y)` (VB reading). `"n=" & a + b`
concatenates the sum. No bitwise ops, no `Xor`/`Is`/`Like`, no ternary.

## 9. Arrays

`Dim a(n)` allocates indices `0..n`, each `Nothing`. Bound evaluated at the `Dim` and
fixed — no `ReDim`, no `Option Base`, one dimension only. Index must be an integral
Number in range. Arrays are references (assignment aliases). `a(i)` and `f(i)` share
syntax; resolved when the name is resolved.

## 10. Built-ins (21, not reserved words, not shadowable)

`Len(s)` · `Mid(s, start, count)` (1-based, truncates past end) · `InStr(hay, needle)`
(1-based or 0) · `UCase(s)` · `LCase(s)` · `Trim(s)` · `Str(v)` · `Val(s)` · `Int(n)` ·
`Abs(n)` · `Sqr(n)` · `Rnd()` → `[0,1)` · `Chr(n)` · `Asc(s)` · `UBound(a)` ·
`Transcript(v)` · `Sleep(n)` · web: `Fetch` · `JsonGet` · `JsonCount` · `JsonKey` (§10.2).
Widgets are objects, not built-ins (§10.1).

`Transcript(v)` writes `v`, converted as by `Str`, as one line to the transcript — a
host-provided log separate from `Print` output (in the playground, the Transcript
window). A host with no transcript sends it to `Print` output. Returns `Nothing`.
As a statement it takes `Print`'s syntax — any number of comma-separated values,
space-separated on one line (§6):

```vb
For i = 1 To 3
  Transcript "step", i      ' to the transcript
Next
Print "done"                 ' to program output
```

`Sleep(n)` pauses the program. A whole Number is **seconds**, a fractional one is
**milliseconds**: `Sleep(2)` waits 2 s, `Sleep(2.5)` waits 2.5 ms. Since Crumb has one
Number type, `Sleep(2.0)` is the whole number 2 and waits 2 s. `n` must be 0 or more.
Returns `Nothing`. Under a scheduler, other programs keep running while one sleeps.

```vb
For i = 3 To 1 Step -1
  Print i
  Sleep(1)                   ' one second
Next
Sleep(500.5)                 ' half a second (500.5 ms)
Print "go"
```

### 10.1 Widgets (objects)

A program builds its screen from the same widgets the FastBlip IDE is made of — labels,
buttons, menus, rows and columns, split and tab panels, text and code editors, lists and
floating windows. It runs on a screen: in the playground, a launch window (a console's
Launch menu) or a `?run=` page. A widget is an **object**: `New` creates it, and its
properties are set and read by calling its **methods** with a dot.

```vb
Dim label = New Label("Hello")
label.setWidth(100)
```

**Classes.** `New` takes the class name and its arguments, always in parentheses:

| Class | `New` | What it is |
|---|---|---|
| `Label` | `New Label(text)` | A line of text |
| `Button` | `New Button(text)` | A push button |
| `Menu` | `New Menu(text)` | A button that opens a list of items |
| `Spacer` | `New Spacer()` | Empty space; in a row or column it takes the space left over |
| `Panel` | `New Panel()` | A container whose children sit where the program puts them |
| `HPanel` / `VPanel` | `New HPanel()` | A row / column that lays its children out |
| `ButtonBar` | `New ButtonBar()` | A row of buttons, styled like a window's bottom bar |
| `HSplitPanel` / `VSplitPanel` | `New HSplitPanel()` | Two panes side by side / stacked, with a divider the user drags |
| `TabPanel` | `New TabPanel()` | Pages chosen by a row of tabs |
| `Window` | `New Window(title)` | A floating window with a title bar, content and a button bar |
| `TextPanel` | `New TextPanel(text)` | A multi-line text box the user can edit |
| `MonacoPanel` | `New MonacoPanel(text, language)` | A code editor (Monaco, the editor of VS Code); `language` is a Monaco language id such as `"vb"` or `"python"` |
| `ListPanel` | `New ListPanel()` | A list the user picks a row from |

`New` with any other name, or the wrong number of arguments, is a load error. Text
arguments are converted as by `Str`.

**Methods of every widget.** Positions and sizes are in pixels, rounded to whole pixels; a
size must be 0 or more.

| Method | Does |
|---|---|
| `setLeft(n)` `setTop(n)` `setWidth(n)` `setHeight(n)` `setBounds(left, top, width, height)` | Place and size the widget (see Layout) |
| `getLeft()` `getTop()` `getWidth()` `getHeight()` | Where it is and how big, as laid out |
| `setFlex(n)` | Its share of the space left over in a row or column |
| `fill()` | Fill the screen or `Panel` it is in (a `Window`: maximize) |
| `setVisible(b)` / `isVisible()` | Show or hide it |
| `setBackground(color)` / `setColor(color)` | Background and text colour, any CSS colour (`"red"`, `"#336"`) |
| `getParent()` | The container it is in, or `Nothing` |
| `remove()` | Take it out of its container (it can be added again) |

**Methods by class.** Indexes (list rows, tabs, children) count from 0; `-1` means none.

| Class | Methods |
|---|---|
| `Label` | `setText(t)` `getText()` `onClick(sub)` |
| `Button` | `setText(t)` `getText()` `setEnabled(b)` `isEnabled()` `onClick(sub)` |
| `Menu` | `setText(t)` `getText()` `addItem(label, sub)` `addSeparator()` `clear()` |
| `Panel` `HPanel` `VPanel` `ButtonBar` | `add(w)` `getCount()` `getChild(i)` `clear()`; `HPanel` and `VPanel` also `setPadding(n)` `setSpacing(n)`; `ButtonBar` also `addButton(text)`, which returns the new `Button` |
| `HSplitPanel` `VSplitPanel` | `setFirst(w)` `setSecond(w)` `getFirst()` `getSecond()` `setPosition(f)` `getPosition()` (the fraction, 0 to 1, given to the first pane) `onChange(sub)` |
| `TabPanel` | `addTab(label, w)` `select(i)` `getSelectedIndex()` `getSelectedText()` `getCount()` `onSelect(sub)` |
| `Window` | `setTitle(t)` `getTitle()` `setContent(w)` `getContent()` `getButtonBar()` `open()` `close()` `maximize()` `restore()` `isMaximized()` `onClose(sub)` |
| `TextPanel` `MonacoPanel` | `setText(t)` `getText()` `append(t)` `setReadOnly(b)` `isReadOnly()` `focus()` `onChange(sub)` `onSubmit(sub)` (Ctrl+Enter) |
| `ListPanel` | `addItem(t)` `removeItem(i)` `setItem(i, t)` `getItem(i)` `getCount()` `clear()` `select(i)` `getSelectedIndex()` `getSelectedText()` `setEmptyText(t)` `onSelect(sub)` |

Methods that set something return `Nothing`. A method that returns a widget (`getChild`,
`getParent`, `getButtonBar`, `addButton`, ...) returns the same object each time for the
same widget, so `=` can tell widgets apart.

**Layout.** A new widget appears on the screen at the top left, at its class's default size
(a `Label` is 100 × 24, a `Button` 100 × 32, a container 320 wide). `add` (or
`setContent`, `setFirst`, `addTab`, ...) moves it into a container. On the screen and in a
`Panel`, a widget sits where `setLeft`/`setTop`/`setBounds` put it, or fills the area
after `fill()`. In an `HPanel`, `VPanel` or `ButtonBar` the container places it: along a
row its width is the one `setWidth` gave it, else a share of the space left over if it
has `setFlex`, else its natural width; its height is the row's. A column works the same
way with heights. A `Window` floats above everything else and cannot go inside another
widget. Nesting rows and columns builds any layout:

```vb
Dim page = New VPanel()
page.fill()
Dim toolbar = New HPanel()
page.add(toolbar)
toolbar.add(New Button("Open"))
Dim list = New ListPanel()
list.setFlex(1)                   ' the list takes the rest of the column
page.add(list)
```

**Rules for method calls.**

- A method call always has parentheses, even with no arguments: `label.getText()`.
  Objects have methods, not fields, so `label.width = 100` is a load error.
- Class and method names are case-insensitive like every name (`label.SetWidth(100)` is
  the same call), and have namespaces of their own: a variable may be called `label`.
- The method name and argument count are checked at load time against every class; that
  the object has that method, and the argument types, are checked when the call runs.
  Calling a method on a value that is not an object is a runtime error, and so is an index
  out of range.
- Calls chain left to right, binding tighter than any operator:
  `win.getButtonBar().addButton("OK")`.
- An object compares with `=` / `<>` by identity, with any other object or `Nothing`.
  `Print` shows it as `<Label>`, `<Window>`, ...; `&` cannot convert it to a String.

A host with no screen (the command line, a console window) makes every `New` of a widget
a runtime error.

**Events.** `onClick`, `onSelect`, `onChange`, `onSubmit`, `onClose` and `Menu.addItem`
name a `Sub` (a String, case-insensitive) to call when the event happens. The Sub takes
no arguments; or one, the widget; or two, the widget and the event's value — the row or
tab index for `onSelect`, the new text for a text panel's `onChange`, the divider
position for a split panel's `onChange`, the item's label for a menu item. Once a program
has registered a handler, reaching the end of its top-level code does not end it: it
waits for events and runs each handler in turn, until it is stopped (Reset, or closing its
window). Events that happen while the program is still running its top-level code, or a
handler, wait their turn.

```vb
Dim list = New ListPanel()
list.addItem("apple")
list.addItem("pear")
Dim shown = New Label("")
shown.setTop(170)
list.onSelect("Picked")

Sub Picked(w, index)
  shown.setText("You picked " & w.getItem(index))
End Sub
```

MiniPy has the same classes and methods, with Python spellings: `label = Label("Hello")`
(no `New`), methods in snake_case (`set_width`, `get_selected_index`,
`on_click`, ...), and handlers are functions, called with as many of (widget, value) as
they take. Whole-number results are ints.

### 10.2 Fetch and JSON

`Fetch(url)` reads a web address and returns the response body as a String; the program
waits for it, and under a scheduler other programs keep running meanwhile (the process
shows as `waiting`). `url` must be an `http:` or `https:` address. A failed request — no
network, an error status such as 404, no answer within 30 s, or a site that does not allow
requests from web pages (CORS) — is a runtime error at the call.

Most web APIs answer in JSON. Crumb has no records, so a JSON document stays a String and
three built-ins read it. A **path** names a value: names and array indexes separated by
dots, indexes counting from 0 as in the JSON — `"current_weather.temperature"`,
`"features.0.properties.place"`. An index may also be bracketed:
`"features[0].properties.place"`. `""` is the whole document.

| Built-in | Does |
|---|---|
| `JsonGet(json, path)` | The value at `path`: a String, Number or Boolean. An object or array comes back as JSON text, which can be given to `JsonGet` again. A JSON `null`, or a path that is not there, is `Nothing`. |
| `JsonCount(json, path)` | The number of items in the array at `path`, or of names in the object there; 0 for anything else, or if nothing is there. |
| `JsonKey(json, path, n)` | The name of the `n`th member (from 0) of the object at `path`, a String. |

Text that is not valid JSON is a runtime error in all three.

```vb
Dim data = Fetch("https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true")
Print "Now:", JsonGet(data, "current_weather.temperature"), "C"

Dim quakes = Fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson")
For i = 0 To JsonCount(quakes, "features") - 1
  Print JsonGet(quakes, "features." & i & ".properties.place")
Next
```

MiniPy's `fetch(url)` returns the parsed JSON instead: objects are dicts, arrays lists,
whole numbers ints, other numbers floats, `null` None; a body that is not JSON comes back
as a str. A failed request raises `OSError`, which `try` can catch.

## 11. Errors

Two fatal, uncatchable phases. No `Try`/`Catch`, no `On Error`.

- **Load errors** — syntax, unterminated block, `Exit For` outside a `For`, duplicate
  declaration, undeclared name, wrong arg count. All reported together; nothing runs.
- **Runtime errors** — type mismatch, index out of range, division by zero, function
  ended without returning, stack exhaustion. Stops at the first one.

Diagnostic shape:

```
tally.crumb:14: error: operator + expects Number, Number but got String, Number
tally.crumb:14:   total = label + 1
```

## 12. Reserved words (25)

`And Dim Else ElseIf End Exit False For Function If Mod New Next Not Nothing Or Print
Return Step Sub Then To True Until While`

`End` is one token; `End If` etc. are two-token pairs. `Until` is reserved but unused,
held for a future `Do…Loop`.

## 13. Grammar (EBNF)

```ebnf
program        = { line } ;
line           = [ statement | sub-decl | function-decl ] NEWLINE ;
body           = { line } ;

sub-decl       = "Sub" IDENT "(" [ params ] ")" NEWLINE body "End" "Sub" ;
function-decl  = "Function" IDENT "(" [ params ] ")" NEWLINE body "End" "Function" ;
params         = IDENT { "," IDENT } ;

statement      = dim-stmt | assign-stmt | call-stmt | method-stmt | print-stmt
               | transcript-stmt | if-stmt | while-stmt | for-stmt | exit-stmt | return-stmt ;

dim-stmt       = "Dim" IDENT [ "=" expression | "(" expression ")" ] ;
assign-stmt    = lvalue "=" expression ;
lvalue         = IDENT [ "(" expression ")" ] ;
call-stmt      = IDENT "(" [ args ] ")" ;
method-stmt    = IDENT [ "(" [ args ] ")" ] method-call { method-call } ;
print-stmt     = "Print" [ expression { "," expression } ] ;
transcript-stmt = "Transcript" [ expression { "," expression } ] ;   (* built-in name, not a keyword *)

if-stmt        = "If" expression "Then"
                 ( statement
                 | NEWLINE body
                   { "ElseIf" expression "Then" NEWLINE body }
                   [ "Else" NEWLINE body ]
                   "End" "If" ) ;
while-stmt     = "While" expression NEWLINE body "End" "While" ;
for-stmt       = "For" IDENT "=" expression "To" expression
                 [ "Step" expression ] NEWLINE body "Next" ;
exit-stmt      = "Exit" ( "For" | "While" ) ;
return-stmt    = "Return" [ expression ] ;

expression     = or-expr ;
or-expr        = and-expr { "Or" and-expr } ;
and-expr       = not-expr { "And" not-expr } ;
not-expr       = "Not" not-expr | compare-expr ;
compare-expr   = concat-expr { ( "=" | "<>" | "<" | "<=" | ">" | ">=" ) concat-expr } ;
concat-expr    = add-expr { "&" add-expr } ;
add-expr       = mul-expr { ( "+" | "-" ) mul-expr } ;
mul-expr       = unary-expr { ( "*" | "/" | "\" | "Mod" ) unary-expr } ;
unary-expr     = ( "-" | "+" ) unary-expr | power-expr ;
power-expr     = member-expr [ "^" unary-expr ] ;
member-expr    = primary { method-call } ;
method-call    = "." IDENT "(" [ args ] ")" ;
primary        = NUMBER | STRING | "True" | "False" | "Nothing"
               | "New" IDENT "(" [ args ] ")"
               | IDENT [ "(" [ args ] ")" ]
               | "(" expression ")" ;
args           = expression { "," expression } ;
```

LL(1) with one wrinkle: a line starting with IDENT may be an assignment, a call or a method
call, all beginning `IDENT "("`. Parse the `lvalue`, then branch on whether the next token
is `=` or `.`.

## 14. Samples

```vb
' FizzBuzz
For n = 1 To 20
  If n Mod 15 = 0 Then
    Print "FizzBuzz"
  ElseIf n Mod 3 = 0 Then
    Print "Fizz"
  ElseIf n Mod 5 = 0 Then
    Print "Buzz"
  Else
    Print n
  End If
Next
```

```vb
Function Factorial(n)
  If n <= 1 Then Return 1
  Return n * Factorial(n - 1)
End Function

For i = 0 To 9
  Print "Factorial(" & i & ") = " & Factorial(i)
Next
```

```vb
Function Reverse(s)
  Dim out = ""
  For i = Len(s) To 1 Step -1
    out = out & Mid(s, i, 1)
  Next
  Return out
End Function

Dim squares(9)
For i = 0 To UBound(squares)
  squares(i) = i ^ 2
Next
Print squares(9)          ' 81
```

## 15. Not in v0.1 (considered and cut)

| Feature | Cost to add |
|---|---|
| `As <Type>` annotations | Type table + checking pass. Natural v0.2; `Dim`'s grammar already ends where the `As` clause would go. |
| `Input` | One built-in + host I/O hook. Cut to keep programs deterministic to test. |
| `Select Case` | Sugar over `ElseIf`; one statement rule, one node type. |
| `Do … Loop [Until]` | Post-tested loops. `Until` already reserved. |
| `Continue For/While` | Two keywords for a case `If` covers. |
| `ByRef`, `Optional`, `ParamArray` | Each changes the calling convention. |
| Multi-dim arrays, `ReDim` | Index lists + reallocation. Arrays can hold arrays already. |
| `Structure`, `Class`, `Enum` | User-defined types. Member access and construction exist for the built-in widget classes (§10.1); declaring classes does not. Largest item here. |
| `Try`/`Catch`, `On Error` | Needs an unwinding model. |
| Modules, `Imports` | Loader + name qualification. |
| Type sigils (`x%`, `s$`) | Nothing to attach them to with one Number type. |
| `:` separator, `_` continuation | Both break the one-line-one-statement rule that keeps the parser simple. |
| String escapes (`\n`) | `""` covers quotes; `Chr` + `&` cover the rest. Needs a second string scanner. |
| `Goto`, line labels | Arbitrary jumps into block structure. Not planned. |
