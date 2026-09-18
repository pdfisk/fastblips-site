# crumb-lang

Tokenizer, parser, bytecode compiler and VM for **Crumb v0.1** — the small
Visual-Basic-flavoured language specified in [`docs/crumb-v0.1-spec.md`](docs/crumb-v0.1-spec.md).

Zero dependencies, ES modules, Node 18+.

`src/vm/compiler/` holds the language implementations, front end to back: one
folder per language, each with the same shape. `src/scheduling/` runs several
programs in turn, and `src/ui/` is the browser UI.

```
src/index.js          parse() / compile() / run() for Crumb
src/ui/browser.js     the bundle entry point (everything on window.Crumb)

src/vm/compiler/basic/            Crumb — the language this repo specifies
  tokens.js           token classes, the 24 reserved words, the 17 built-ins
  lexer.js            source text -> tokens              (spec section 2)
  parser.js           tokens      -> AST                 (spec section 13)
  compiler.js         AST -> bytecode, and the resolver  (sections 5, 7, 9, 10)
  opcodes.js          the instruction set
  values.js           runtime values and conversions     (sections 3, 10)
  builtins.js         the 17 built-in functions          (section 10)
  vm.js               the stack machine
  loader.js           the tokenize -> parse -> compile -> run pipeline
  disasm.js           bytecode listing
  diagnostics.js      CrumbError + the section 11 diagnostic format
  format.js           AST -> indented s-expression; tokens -> table

src/vm/compiler/python/           MiniPy — a Python subset, same pipeline
  tokens.js lexer.js parser.js compiler.js opcodes.js
  values.js builtins.js vm.js diagnostics.js
  loader.js           parse() / compile() / run() for MiniPy

src/scheduling/process.js    Process: one running program (a VM + state)
src/scheduling/scheduler.js  Scheduler: round-robin time slicing, delayed starts

src/ui/               widgets and windows (see docs/widgets.txt)
src/ui/runtime.js     the Scheduler the browser UI runs programs on
src/ui/windows/basic-console-window.js    a console that runs Crumb
src/ui/windows/python-console-window.js   a console that runs MiniPy

bin/crumb.js          CLI
web/                  the playground page and its build
```

## Front ends

Crumb is the language the spec describes, and the one everything else in this
README is about: the CLI, `src/index.js`, the test suite and the scheduler are
all Crumb's.

MiniPy is a second, smaller front end under `src/vm/compiler/python/` —
indentation-delimited Python with functions, classes, exceptions, f-strings
and list comprehensions, compiled to its own bytecode and run on its own stack
machine. It shares the pipeline's shape but none of its code, and is reached
through its own loader rather than `src/index.js`:

```js
import { run } from './src/vm/compiler/python/loader.js';

const { output, loadErrors, error, ok } = run(source, { filename: 'tally.py' });
```

Its VM has no `runSlice`, so a MiniPy program runs to completion rather than
on the scheduler; `maxSteps` is what bounds a runaway loop. There is no CLI
front end for it, and the test suite does not cover it yet.

## Playground

`web/` holds a single-file browser page — editor with syntax highlighting and
a line gutter, output pane, bytecode view, examples, and Run / Clear buttons.
The whole implementation is bundled into the page, so it runs entirely in the
browser with no server and no network.

```
node web/build.mjs --standalone   # web/index.html, a complete document: open it directly
node web/build.mjs                # web/crumb-playground.html, no doctype/head, for embedding
```

The build stamps its date and time into the page footer, in UTC and labelled as
such. Set `SOURCE_DATE_EPOCH` (Unix seconds) to pin it instead of reading the
clock, so the output is reproducible.

esbuild (fetched by `npx` at build time) is the only thing outside the
runtime's zero dependencies. The page caps execution at 8 M instructions, so a
runaway loop reports the budget rather than hanging the tab.

## Use

```js
import { run, compile, parse } from 'crumb-lang';

const { output, loadErrors, error, ok } = run(source, { filename: 'tally.crumb' });
```

Nothing throws on bad input. Per spec section 11 load errors are collected and
returned as a list; a runtime error comes back as `error` with a `line` and a
`traceback`. `parse` stops after the AST, `compile` returns the chunk.

```
$ crumb run    examples/fizzbuzz.crumb   # compile and execute (default)
$ crumb dis    examples/factorial.crumb  # disassemble
$ crumb check  examples/broken.crumb     # load errors only; exit 1 if any
$ crumb parse  examples/words.crumb      # indented s-expression AST
$ crumb tokens examples/words.crumb      # one line per token
$ crumb json   examples/words.crumb      # AST as JSON
```

`run` takes VM options: `out` (a line sink), `transcript` (the line sink for
the `Transcript` built-in; defaults to `out`), `maxSteps` (an instruction
budget), `maxDepth` (frame limit), `random` (the source `Rnd` draws from,
so tests are deterministic), and `sleep` (a blocking `(ms) => void` that
`run` calls for the `Sleep` built-in; tests pass a no-op).

`Sleep(n)` takes seconds for a whole Number and milliseconds for a fractional
one. The VM never waits itself: the built-in records the request and
`runSlice` returns early. `run()` then blocks (with `Atomics.wait`, or a
busy-wait where that is unavailable); a `Scheduler` instead parks the
process and runs the others.

## Scheduling

Several programs can share one thread, taking turns.

```js
import { Scheduler } from './src/scheduling/scheduler.js';

const scheduler = new Scheduler({ quantum: 100 });  // instructions per turn
scheduler.spawn(compile(a).chunk, { name: 'a' });
scheduler.spawn(compile(b).chunk, { name: 'b', delay: 500 });  // starts in 500 ms
await scheduler.runToCompletion();
```

`VM.runSlice(budget)` runs at most `budget` instructions and returns `true`
once the program has halted; calling it again resumes where it stopped, since
all execution state lives on the VM. A `Sleep` also ends the slice early;
`takeSleep()` returns the requested milliseconds. `run()` loops `runSlice()`
with no budget, blocking for each sleep.

A `Process` wraps one VM with a `pid`, a `name`, a `startAt` time and a state:
`scheduled` -> `ready` <-> `running` <-> `sleeping` -> `done` | `failed` |
`killed`; any unfinished process can also be `suspended`. A runtime error is captured on the process (`error`) and does not
stop the others. An `onExit(process)` option is called once when it finishes
for any reason.

The `Scheduler` keeps two queues:

- `activeQueue` — ready processes in run order. `tick()` gives the next one a
  turn of `quantum` instructions and requeues it if it has not finished.
- `scheduledQueue` — processes spawned with a `delay`, or sleeping, sorted
  by `startAt` (the time each next becomes ready; ties keep insertion order).
  Each `tick()` first moves the ones that are due to `activeQueue`.

`runAll()` ticks until nothing is ready; processes not yet due keep waiting.
`runToCompletion()` also sleeps until the next start time and returns when
both queues are empty. `start({ sliceMs })` does the same in the background
for a page: it ticks for at most `sliceMs` (16) of wall-clock time before
yielding to the event loop, and a second call while running returns the same
promise after waking the loop, so a process spawned or resumed while every
other one is asleep runs at once.

`suspend(pid)` takes a process out of both queues and `resume(pid)` puts it
back; a delayed or sleeping process keeps what remained of its wait.
Suspended processes do not count towards `empty`, so a background loop ends
when everything left is suspended; call `start()` after `resume`. `list()`
returns every unfinished process, suspended ones included. `kill(pid)`, `get(pid)`, `idle`, `empty` and
`nextStartAt` round it out. The clock is injectable (`new Scheduler({ now })`)
so tests can control time. A process cannot yet block on input.

## The pipeline

**Lexer.** Keywords and identifiers fold case but keep their source spelling.
`""` is the only string escape. Runs of blank and comment-only lines collapse
to one `NEWLINE`, a leading run is dropped, and a missing final one is
supplied, so the parser can treat `NEWLINE` as a plain terminator. Lexical
errors are recorded and scanning continues.

**Parser.** One function per precedence level of section 8, named after its
grammar production. The one non-LL(1) spot is section 13's: a line starting
`IDENT "("` may be an assignment or a call, so `parseAssignOrCall` parses the
name and its argument list, then branches on `=`. Recovery is panic-mode,
synchronising on `NEWLINE` and on `End`/`Else`/`ElseIf`/`Next`.

**Compiler.** Also the resolver. It allocates slots (a flat globals array, a
flat slots array per procedure), classifies each `Apply` node as an array
index, a user call or a built-in call, inserts `For`'s implicit loop-variable
declaration, and reports the load errors the parser cannot see.

**VM.** A stack machine with a switch dispatch over a flat `code` array of
opcode-plus-inline-operand words. Types are checked at the instruction,
because Crumb does no coercion.

## Bytecode

37 opcodes. Operands are inline; jump targets are absolute addresses into
`code`, so a disassembly listing's addresses match its jump annotations.

```
chunk = {
  code:        number[]    // opcode, operands, opcode, operands, ...
  lines:       number[]    // parallel to code: source line per word
  constants:   value[]     // pooled; identical literals share a slot
  globalCount, globalNames
  procedures:  [{ name, kind, arity, entry, slotCount, line }]
  entry:       0           // module code runs first, procedures are appended
}
```

`For` is desugared rather than given its own opcodes. With a literal step —
including the default of `1` — the direction is known at compile time and the
loop is a single comparison per iteration; a computed step adds two hidden
slots and a runtime direction test. Either way start, limit and step are
evaluated once, in that order, and the loop variable is assigned only
afterwards, so `For i = 1 To i` reads the old `i` as its limit.

`And` and `Or` compile to `AND_JUMP`/`OR_JUMP`, which check the left operand's
type and jump over the right; a `CHECK_BOOL` after the right operand checks it
when it is reached. Short-circuiting therefore also short-circuits the type
check, which is what makes `False And 1 = "x"` legal.

```
$ crumb dis examples/factorial.crumb
line     addr  op             args    ; note
    6      0  CONST          0       ; 0
    |      2  CONST          1       ; 9
    |      4  SET_GLOBAL     1       ; for$limit$1
    |      6  SET_GLOBAL     0       ; i
    ...
```

## Semantics worth knowing

These are places the spec was silent or ambiguous and the implementation had
to decide. Each is a candidate spec amendment, not a private extension.

- **A procedure's `For` variable is local.** Section 6 says `For` declares its
  variable "in the enclosing scope"; inside a procedure that is the procedure,
  so the lookup does not fall through to module scope. Without this, `For i`
  in a procedure would drive a module variable that merely shares the name,
  and a caller's own `For i` loop would never terminate.
- **`=` and `<>` accept `Nothing` against any type**, yielding False/True.
  Section 8 requires matching types, but section 3's "only `=` and `<>` accept
  it" is unusable otherwise. Ordering operators still require two Numbers or
  two Strings.
- **Arrays compare by identity** under `=` and `<>`, and cannot be converted
  by `&`.
- **`Step 0` loops forever**, as it does in VB. The VM's `maxSteps` budget is
  the escape hatch, not a language rule.
- **`Val` is strict**: its argument must match section 2's NUMBER production
  exactly, so `Val("-3")` is an error — there is no sign in a number literal.
- **Booleans print as `True`/`False`** and `Nothing` as the empty string.

## Load errors

Everything in section 11's list is detected before anything runs, and all of
them are reported together.

*Parser:* syntax; unterminated block; mismatched `End`; two statements on one
line; `Exit` outside a matching loop; `Return` outside a procedure, bare in a
`Function`, or with a value in a `Sub`; nested procedures; duplicate procedure
or parameter name; assignment to a call; an array `Dim` with an initialiser; a
reserved word used as a name.

*Compiler:* reference to an undeclared name (and, at module scope, use before
its `Dim`); duplicate `Dim` in one scope; wrong argument count for a procedure
or a built-in; a subscript with other than one index; shadowing a built-in; a
procedure and a variable sharing a name; a `Sub` used as a value; a bare
procedure or built-in name used as a variable.

A file with parse errors is not compiled at all, so the resolver never reports
cascades from a broken AST.

## Runtime errors

Uncatchable, with a source line and a traceback of call sites:

```
errors.crumb:9: error: operator + expects Number, Number but got String, Number
errors.crumb:9:     Return label + k
  in Function Boom, called at errors.crumb:3
  in Function Depth, called at errors.crumb:4
  in Function Depth, called at errors.crumb:13
```

Type mismatch, index out of range, division by zero, a `Function` that ended
without returning, an array bound that is not a whole number, a stack
exhausted by runaway recursion, and the instruction budget.

## Test

```
npm test
```

136 tests: lexer behaviour; every precedence rule and associativity in section
8; each statement form; the procedure rules; error collection and recovery;
resolution, arity and slot allocation; the VM's arithmetic, comparison,
short-circuiting, control flow, arrays, procedures and built-ins; and the
scheduler's time slicing, delayed starts, sleeping, background running,
suspend and resume, failure isolation and kill.
`examples/broken.crumb` plants 14 load errors and the suite asserts exactly 14
diagnostics, so a recovery regression that starts cascading fails the build;
`examples/errors.crumb` asserts the runtime traceback.

Beyond the suite: 20,000 random token streams and 4,000 generated programs run
without a crash, a hang or a single unbalanced value stack. The playground page
has its own 14-check headless pass covering the buttons, the keyboard
shortcuts, the error gutter, error-to-line jumping, the instruction budget and
the 400px layout.

## Performance

Node 22, one core:

| program | ops | throughput |
|---|---|---|
| `Fib(27)` recursive | 6.4 M | 7.8 M ops/s |
| 3 M-iteration `For` with `Mod` | 45 M | 13.1 M ops/s |
| Sieve to 200,000 | 10.6 M | 10.4 M ops/s |

## Still to come

An `As <Type>` pass, `Input`, and the section 15 list generally. The compiler
is where types would land: it already walks every expression with the
declarations in hand.
