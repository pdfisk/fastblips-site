# FastBlip Languages

FastBlip supports two languages:

- **Crumb** ("FastBlip Basic") — a custom, Visual-Basic-flavoured language
  specified in `docs/crumb-v0.1-spec.md`.
- **MiniPy** — a subset of Python, aiming to behave exactly like CPython for
  the programs it accepts.

Both are compiled in the browser to the **same bytecode** and run on the
**same VM** and scheduler.

## 1. What is implemented today

### Crumb (Basic) v0.1 — complete to spec

Design rules: one statement per line; blocks close with `End`; nothing is
implicit (declare every variable, conditions must be Boolean, calls need
parentheses, a `Function` must `Return`); no type coercion.

| Area | Supported |
|---|---|
| Types | Number (one IEEE double), String, Boolean, Nothing, Array (1-D, fixed length, by reference) |
| Declarations | `Dim x`, `Dim x = expr`, `Dim a(n)`; module and procedure scope only |
| Statements | assignment, `Print`, `Transcript`, block and single-line `If`/`ElseIf`/`Else`, `While`, `For … To … Step … Next`, `Exit For`/`Exit While`, `Return`, calls |
| Procedures | `Sub` and `Function`, fixed arity, pass by value, recursion, call-before-declare |
| Operators | `^`, unary `-`/`+`, `* / \ Mod`, `+ -`, `&` (the only converting operator), comparisons, `Not`, short-circuit `And`/`Or` |
| Built-ins (21) | Strings: `Len Mid InStr UCase LCase Trim Str Val Chr Asc` · Maths: `Int Abs Sqr Rnd` · `UBound` · `Transcript Sleep` · Web: `Fetch JsonGet JsonCount JsonKey` |
| Objects | Widgets are objects: `Dim label = New Label("Hello")`, then methods such as `label.setWidth(100)` (classes `Label`, `Button`) |
| Errors | All load errors reported together before running (§11); runtime errors with line and call traceback |

Not in v0.1 (spec §15): `As <Type>`, `Input`, `Select Case`, `Do … Loop`,
`Continue`, `ByRef`/`Optional`, multi-dimensional arrays and `ReDim`,
`Structure`/`Class`/`Enum`, `Try`/`Catch`, modules/`Imports`, string escapes.

### MiniPy — a practical Python subset

| Area | Supported |
|---|---|
| Types | `int` (arbitrary precision), `float`, `bool`, `str`, `None`, `list`, `tuple`, `dict` |
| Syntax | indentation blocks, `if/elif/else`, `while`, `for … in`, `break`/`continue`/`pass`, `del`, augmented assignment, slices, `is`/`is not`, `in`/`not in`, f-strings, list comprehensions |
| Functions | `def`, default arguments, `return` |
| Classes | `class` with single inheritance, methods, attributes, `isinstance` |
| Exceptions | `try`/`except`/`else`/`finally`, `raise`, Python-style tracebacks |
| Built-ins | `print abs bool dict dir float int isinstance len list max min range sorted str sum tuple type`, plus FastBlip's `sleep transcript fetch` and the widget classes `Label Button` (`label = Label("Hello")`, `label.set_width(100)`) |
| Verification | Every test program's output is compared with CPython's own |

Not yet: `import`, `lambda`, `global`/`nonlocal`, generators/`yield`, `with`,
`assert`, sets, dict/set comprehensions, `*args`/`**kwargs` and keyword
arguments, `async`.

## 2. How the two languages work together

The languages are **separate front ends over one shared back end**. They do
not call each other's code, but everything below the compiler is common:

```
   Crumb source ──▶ Crumb compiler ──┐
                                     ├──▶ one instruction set ──▶ one VM ──▶ one Scheduler
   MiniPy source ─▶ MiniPy compiler ─┘       (core | crumb | python opcodes)
```

**The shared instruction set.** 89 opcodes in three sections: 19 `core`
opcodes whose meaning is the same in both languages (constants, variables,
jumps, calls, returns, `PRINT`, `TRANSCRIPT`, `HALT`); 23 `crumb` opcodes
with Crumb's strict value rules; 47 `python` opcodes with Python's. The rule
is *one opcode means one thing*: where the languages disagree (`Mod` vs `%`,
`And` vs `and`), each meaning has its own opcode. The tests check that each
compiler emits only core plus its own section.

**What the two languages share at run time:**

| Shared facility | Effect |
|---|---|
| Scheduler | Crumb and MiniPy processes run side by side and take turns; the Process window lists both. |
| Sleep | `Sleep(n)` and `sleep(s)` park the process the same way. |
| Transcript | `Transcript` and `transcript()` write to the same log window. |
| Widgets | Both make the same widget objects with the same methods (`New Label("Hi")` ≡ `Label("Hi")`, `label.setWidth(100)` ≡ `label.set_width(100)`, …). |
| Fetch | One implementation; Crumb receives a String and reads it with `JsonGet`, MiniPy receives dicts and lists. |
| Database and `?run=` | Both languages have a source table; a `?run=` URL finds a program in either. |
| Tools | One disassembler, one fault system (with per-language wording), one runtime value model. |

**What they do not share (yet):** a Crumb program cannot import a MiniPy
module or call its functions, and two running programs cannot exchange data
except by printing to the same transcript.

**When to use which.** Crumb is the teaching and rapid-app language: small,
strict, with error messages that point at the mistake. MiniPy is for users
who already know Python, or who need its richer data structures, classes and
exceptions.

## 3. What needs to be done next

### Crumb v0.2
1. `Input` (and an `InputBox`-style widget) — the scheduler can already park a
   process waiting for an event, so this is mostly a host hook.
2. `Select Case`, `Do … Loop [While|Until]`, `Continue For/While` — cheap sugar.
3. `As <Type>` annotations with a compile-time checking pass (the spec's
   planned v0.2 headline).
4. `Try`/`Catch` — reuse the exception-handler machinery MiniPy already
   added to the VM.
5. Records (`Structure`) and then lists/dictionaries as built-in types or
   libraries, so Crumb programs can handle JSON without string paths.

### MiniPy
1. `lambda`, `global`/`nonlocal`, keyword arguments and `*args` — needed by
   most real-world snippets.
2. Sets and dict comprehensions; common string/list methods to parity.
3. A standard-library shim: `math`, `random`, `time`, `json` as built-in
   modules behind `import`.
4. Generators (`yield`) — natural on this VM, since frames are already
   suspendable objects.

### Cross-language
1. **Message passing between processes.** `Send(pid, value)` / `Receive()`
   (and `send` / `receive`), with the receiver `waiting` until a message
   arrives. This lets a Crumb UI program talk to a MiniPy worker and is the
   natural model for a multitasking system.
2. **Shared value model at the boundary.** Define how values cross:
   Number ⇄ int/float, String ⇄ str, Array ⇄ list, Nothing ⇄ None.
3. **Modules.** A common `Import "name"` / `import name` resolved from the
   database, so a library written in one language is callable from the
   other through the shared calling convention.
4. **Common built-in library.** Specify each new built-in once (e.g. canvas
   drawing, storage, timers) with a Crumb spelling and a Python spelling, as
   the widget and fetch built-ins already are.
5. **Language chosen by the program, not the table.** Store a `language`
   field on each record (or use one `programs` table), so new front ends do
   not need new tables.
