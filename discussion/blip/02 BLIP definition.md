# BLIP — Browser Loadable Interpreted Program

A **BLIP** is a program that a browser loads from the FastBlips database and
runs on a bytecode interpreter inside the page. It is written in Basic or
Python, compiled to FastBlips bytecode, and executed by a virtual machine
(VM) under a scheduler that can run many BLIPs at once.

```
https://fastblips.com/?run=abc
```

loads the program named `abc` from the database and runs it as a full-page
app. (The discussion notes used `?name=abc.bas`; the implemented parameter is
`?run=`, and the name is the record's name. The table it is found in — Basic
first, then Python — decides the language, so no extension is needed.)

## Why a bytecode interpreter, and not plain JavaScript?

The obvious way to run another language in a browser is to translate it to
JavaScript and hand it to the browser's engine. FastBlips deliberately does
not. It compiles to its own bytecode and interprets it, because that buys
properties JavaScript cannot give:

### 1. Programs can be stopped at any instruction

JavaScript runs to completion: a `while (true)` loop freezes the tab, and
nothing can pause a function halfway through. FastBlips' VM keeps *all*
execution state — the value stack, call frames, exception handlers, the
program counter — in ordinary objects. `vm.runSlice(n)` executes at most `n`
instructions and returns; calling it again carries on exactly where it
stopped. That single property is the foundation for everything below.

### 2. Cooperative multitasking without threads

Because every program can be interrupted, one browser thread can share its
time among many of them. The Scheduler gives each ready process a
*quantum* (default 100 instructions), then moves to the next, and yields to
the browser at least every 16 ms so the page stays responsive. Ten programs
can run side by side — some computing, some sleeping, some waiting for a
click — with no Web Workers and no shared-memory hazards.

### 3. Blocking calls without freezing the page

`Sleep(2)`, `Fetch(url)` or waiting for a button click all *look* like
ordinary blocking calls to the program. Underneath, the built-in records the
request and ends the slice early; the scheduler parks the process (`sleeping`
or `waiting`) and runs the others; when the timer fires, the response
arrives or the button is clicked, the result is pushed onto the VM's stack
and the process resumes. Beginners write straight-line code; the browser
never blocks.

### 4. A safe sandbox

A BLIP can only do what its opcodes and built-ins allow. It cannot touch the
DOM, cookies or other pages except through the narrow built-ins FastBlips
provides (widgets, `Fetch`, the transcript). An instruction budget
(`maxSteps`) and a frame limit (`maxDepth`) turn runaway loops and runaway
recursion into ordinary, reported errors rather than a hung or crashed tab.
That matters when anyone can publish a program to a shared database.

### 5. Inspectable and controllable

Every process has a pid, a name, a state and an instruction count. The
Process window lists them live and can suspend, resume or kill each one.
Because the program counter maps to a source line (`chunk.lines`), the same
machinery supports single-stepping and debugging (see *Next steps*).

### 6. One back end, several languages

Crumb and MiniPy compile to the same 89-opcode instruction set and run on
the same VM, so scheduling, sleeping, widgets, fetch, the disassembler and
the debugger are written once. Adding a language means writing a front end,
not another runtime.

### 7. Portable, compact, source-optional

A compiled chunk is a flat array of numbers plus a constant pool and a
procedure table. It is small, loads instantly and does not depend on the
browser's JavaScript dialect. In principle it can be shipped *without* the
source, for faster loading or to protect a program's code.

## The cost

Interpreting in JavaScript is slower than letting the browser JIT-compile
native JavaScript — typically by an order of magnitude for tight numeric
loops. Measured today on one core (Node 22): 13–23 M instructions/second for
Crumb, 16–32 M for MiniPy (whose integers are exact bigints). That is ample
for interactive apps, games of modest complexity, teaching and data-driven
tools, which are FastBlips' targets. Heavy work (graphics, maths) belongs in
built-ins implemented in JavaScript and called from bytecode.

## Lifecycle of a BLIP

```
 source ─▶ lexer ─▶ parser ─▶ compiler ─▶ chunk (bytecode)
                                              │
               Scheduler.spawn(chunk) ──▶ Process(VM)
                                              │
     scheduled ─▶ ready ◀──▶ running ──▶ done | failed | killed
                    ▲           │
                    └─ sleeping / waiting (Sleep, Fetch, clicks)
                    any unfinished process ⇄ suspended
```

Load errors are all collected before anything runs; a runtime error stops
only the process that raised it and is reported with a source line and a
traceback, while the other processes carry on.

## Capabilities — claimed vs. implemented

| Capability | Status | Notes |
|---|---|---|
| Halt / resume a program | ✅ | `suspend(pid)` / `resume(pid)`; Suspend/Resume in the Process window. A sleeping process keeps the rest of its sleep. |
| Kill a program | ✅ | `kill(pid)`; Kill button; closing a console or launch window. |
| Single-step | ◐ | The VM supports it (`runSlice(1)`), but there is no step command in the Scheduler or UI yet. |
| Several programs at once | ✅ | Round-robin scheduler; Crumb and MiniPy processes mix freely. |
| Priority levels | ❌ | Every process gets the same quantum in turn. |
| Delayed start | ✅ | `spawn(chunk, { delay })`. |
| Run from bytecode without source | ❌ | The database stores source; chunks exist only in memory. |
| Deploy by adding to the database | ✅ | Save in the Database window; the program is live at `?run=<name>`. |
| Run from a URL | ✅ | `?run=<name>`, on any device. |
| Installable PWA | ❌ | No manifest or service worker yet. |

## Next steps

1. **Single-step and breakpoints.** Add `scheduler.step(pid)` (one
   instruction, or one source line: run until `chunk.lines[pc]` changes),
   and a breakpoint set checked by `runSlice`. Surface Step / Continue in the
   Process window, with the current line highlighted in the console editor
   and the process's globals and locals shown (names are already in
   `globalNames` / `slotNames`).
2. **Priorities.** Give each process a priority (e.g. 1–5). Simplest scheme:
   quantum scaled by priority; stronger: one ready queue per level, with
   ageing so low levels are never starved. Expose `SetPriority` / a column in
   the Process window.
3. **Bytecode serialisation.** Define a versioned chunk format (JSON first,
   a compact binary later) with an opcode-table hash, so a VM refuses a chunk
   built for a different instruction set. Add a `bytecode` column to the
   source tables, filled on save, and let `?run=` load it directly — the
   compiler then never has to run on the viewer's device.
4. **PWA packaging.** A manifest and service worker per BLIP
   (`?run=<name>` → installable, with its name and icon), caching the
   runtime bundle and the program's chunk for offline use.
5. **Access control.** Once anyone can publish, programs need owners,
   and the `?run=` page needs to treat every BLIP as untrusted (it already
   does at the VM level; built-ins that reach the network deserve per-program
   limits).
