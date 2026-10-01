# FastBlips — Overview

*Site: [fastblips.com](https://fastblips.com) · Codebase: `crumb` (package `crumb-lang`)*

## What FastBlips is

FastBlips is a development and deployment framework for rapidly building
applications that run in a web browser. A program is written in Basic or
Python, compiled to bytecode, and run by an interpreter that lives entirely
in the page. Programs are stored in a server database, so publishing one is
as simple as saving it: the moment a record is saved, the program is live at
its own URL on desktop and mobile browsers alike.

The unit of deployment is a **BLIP** — a *Browser Loadable Interpreted
Program* (see *02 BLIP definition*).

## Goals

| Goal | What it means |
|---|---|
| **Rapid development** | Write, run and fix a program in one browser page, with no toolchain, build step or install. |
| **Two approachable languages** | A Visual-Basic-style language (Crumb, "FastBlips Basic") and a Python subset (MiniPy), both compiling to the same bytecode. |
| **Multitasking** | Many programs run at once in one page, taking turns under a scheduler, and can be paused, resumed or stopped individually. |
| **Bytecode interpreter architecture** | One compact stack-machine VM shared by both languages; execution state lives in the VM, so any program can be paused after any instruction. |
| **Runs anywhere a browser does** | Desktop and mobile browsers, with no plug-ins or native code. |
| **Progressive Web Apps** | A BLIP can be installed to a home screen and behave like a native app (planned). |
| **Instant deployment** | Programs are records in a server database; saving one publishes it. |
| **Visual form designer** | Screens are built by placing widgets in the Designer, then wired to short handlers. |
| **Apps run without source** | A published BLIP can be delivered as bytecode only (planned). |
| **Low-code apps** | Screens from the designer plus data binding, so small apps need little code (partly built). |

## First audience: learners

FastBlips is aimed first at **people learning to program**. That sets the
priorities:

- **Crumb first** for beginners: strict, explicit, with errors that point
  at the mistake; MiniPy for learners moving on to Python.
- **Nothing to install** — a link is enough to start, on a school or
  library computer or a phone.
- **Seeing programs run** — single-step, breakpoints and a variable view
  move up the list, as does the Process window as a teaching tool.
- **Quick, visible results** — widgets, `Fetch` from free APIs, games on
  Board and Canvas.
- **Tutorials and examples** that open as the learner's own copy.
- **A safe place to share** — moderation and minimal personal data, since
  many learners are school students.

## How the pieces fit

```
  author  ──▶  Playground (desktop UI)  ──▶  Database server  ──▶  fastblips.com?run=<name>
               editor · consoles ·           basic_source          a full-page app on any
               scheduler · launch windows    python_source         device, phone included
                         │
                         ▼
            Crumb / MiniPy compiler ──▶ bytecode ──▶ shared VM ──▶ Scheduler
```

- **Front ends** — a lexer, parser and compiler for each language
  (`src/vm/compiler/basic`, `src/vm/compiler/python`).
- **Back end** — one instruction set (89 opcodes) and one VM (`src/vm`).
- **Scheduler** — round-robin time slicing of many processes on the page's
  single thread (`src/scheduling`).
- **UI toolkit** — windows, panels and widgets for the playground, plus the
  widgets programs create for themselves (`src/ui`).
- **Database** — a small Rails JSON API holding the Basic and Python source
  tables.

## Status at a glance (September 2026)

| Area | Status |
|---|---|
| Crumb (Basic) language v0.1 | Implemented to spec, 27 built-ins |
| MiniPy (Python subset) | Implemented; output checked against CPython |
| Shared bytecode VM | Implemented; ~13–32 M ops/s on Node 22 |
| Multitasking scheduler | Round robin, sleep, suspend/resume/kill, delayed start |
| Desktop playground | Consoles, database browser, process window, themes |
| Program widgets | Button and Label only |
| Database deployment + `?run=` page | Implemented |
| Mobile | `?run=` apps work on phones; the full IDE shows a landing page |
| PWA packaging, priorities, bytecode-only deploy | Not yet started |

## Where to read next

1. *02 BLIP definition* — why a bytecode interpreter in the browser.
2. *03 Languages* — what each language supports and how they cooperate.
3. *04 Applications* — running from the database, mobile, the open-source runtime.
4. *05 GUI widgets* — the widget toolkit and what to build next.
5. *06 Community* — forum, gallery and where to post.
