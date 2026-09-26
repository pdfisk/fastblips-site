# Crumb — language specification, draft v0.1

A small imperative language with Visual Basic's surface syntax. One statement per line,
blocks closed with `End`, four value types, dynamically typed, no coercion.
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
- OPERATOR: `+ - * / \ ^ & = <> <= >= < > ( ) ,`
- 24 reserved words (§12).

## 3. Values and types

| Type | Notes |
|---|---|
| Number | IEEE 754 double, the only numeric type; prints without decimal point when integral |
| String | Immutable; built-ins index from **1** |
| Boolean | `True` / `False`; the only type a condition accepts |
| Nothing | Value of a bare `Dim`, result of a `Sub`; only `=` / `<>` accept it |
| Array | Fixed-length, reference value (§9) |

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
| 1 | `()` `f(…)` `a(i)` | — | grouping, call, index |
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

## 10. Built-ins (27, not reserved words, not shadowable)

`Len(s)` · `Mid(s, start, count)` (1-based, truncates past end) · `InStr(hay, needle)`
(1-based or 0) · `UCase(s)` · `LCase(s)` · `Trim(s)` · `Str(v)` · `Val(s)` · `Int(n)` ·
`Abs(n)` · `Sqr(n)` · `Rnd()` → `[0,1)` · `Chr(n)` · `Asc(s)` · `UBound(a)` ·
`Transcript(v)` · `Sleep(n)` · widgets: `AddButton` · `AddLabel` · `SetText` · `GetText` ·
`SetBounds` · `OnClick` (§10.1) · web: `Fetch` · `JsonGet` · `JsonCount` · `JsonKey` (§10.2)

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

### 10.1 Widgets

A program can put buttons and labels on the screen it runs on — in the playground, a
launch window (a console's Launch menu) or a `?run=` page. Positions and sizes are in
pixels from the top left of the screen, rounded to whole pixels. A widget is a Number,
its id (1, 2, ...). A host with no screen (the command line, a console window) makes
every widget built-in a runtime error.

| Built-in | Does |
|---|---|
| `AddButton(text, left, top, width, height)` | Adds a button; returns its id. `text` is converted as by `Str`. |
| `AddLabel(text, left, top, width, height)` | Adds a label (a line of text); returns its id. |
| `SetText(w, text)` | Changes the text shown by widget `w`. Returns `Nothing`. |
| `GetText(w)` | The text widget `w` shows, a String. |
| `SetBounds(w, left, top, width, height)` | Moves and sizes widget `w`. Returns `Nothing`. |
| `OnClick(w, "SubName")` | Calls that `Sub` each time `w` is clicked. Returns `Nothing`. |

The handler is named by a String (case-insensitive) and must be a `Sub` taking no
arguments, or one: the widget clicked. Once a program has called `OnClick`, reaching the
end of its top-level code does not end it: it waits for clicks and runs each handler in
turn, until it is stopped (Reset, or closing its window). Clicks made while the program is
still running its top-level code, or a handler, wait their turn.

```vb
Dim clicks = 0
Dim counter = AddLabel("Clicks: 0", 20, 20, 200, 24)
Dim button = AddButton("Click me", 20, 50, 120, 32)
OnClick(button, "Clicked")

Sub Clicked()
  clicks = clicks + 1
  SetText(counter, "Clicks: " & clicks)
End Sub
```

MiniPy has the same built-ins, named `add_button`, `add_label`, `set_text`, `get_text`,
`set_bounds` and `on_click`; the handler given to `on_click` is a function, called with no
arguments or with the widget.

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

## 12. Reserved words (24)

`And Dim Else ElseIf End Exit False For Function If Mod Next Not Nothing Or Print Return
Step Sub Then To True Until While`

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

statement      = dim-stmt | assign-stmt | call-stmt | print-stmt | transcript-stmt | if-stmt
               | while-stmt | for-stmt | exit-stmt | return-stmt ;

dim-stmt       = "Dim" IDENT [ "=" expression | "(" expression ")" ] ;
assign-stmt    = lvalue "=" expression ;
lvalue         = IDENT [ "(" expression ")" ] ;
call-stmt      = IDENT "(" [ args ] ")" ;
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
power-expr     = primary [ "^" unary-expr ] ;
primary        = NUMBER | STRING | "True" | "False" | "Nothing"
               | IDENT [ "(" [ args ] ")" ]
               | "(" expression ")" ;
args           = expression { "," expression } ;
```

LL(1) with one wrinkle: a line starting with IDENT may be an assignment or a call, both
beginning `IDENT "("`. Parse the `lvalue`, then branch on whether the next token is `=`.

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
| `Structure`, `Class`, `Enum` | User-defined types, member access, construction. Largest item here. |
| `Try`/`Catch`, `On Error` | Needs an unwinding model. |
| Modules, `Imports` | Loader + name qualification. |
| Type sigils (`x%`, `s$`) | Nothing to attach them to with one Number type. |
| `:` separator, `_` continuation | Both break the one-line-one-statement rule that keeps the parser simple. |
| String escapes (`\n`) | `""` covers quotes; `Chr` + `&` cover the rest. Needs a second string scanner. |
| `Goto`, line labels | Arbitrary jumps into block structure. Not planned. |
