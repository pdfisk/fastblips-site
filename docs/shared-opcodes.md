# One instruction set for Crumb and MiniPy

Design note, 18 September 2026. Status: implemented.

Crumb (the VB-flavoured language in `crumb-v0.1-spec.md`) and MiniPy (a
Python subset) used to have separate bytecodes and separate VMs. Now both
compile to one instruction set, `src/vm/opcodes.js`, and run on one stack
machine, `src/vm/vm.js`. A MiniPy program therefore runs on the Scheduler next
to Crumb programs, sleeps without blocking, can be suspended and killed, and
disassembles with the same tool.

## The rule

**One opcode means one thing.** The language that compiled a chunk never
changes what an opcode does. Where Crumb and Python disagree about an
operator, each meaning gets its own opcode.

Letting a flag on the chunk change an opcode's behaviour would have been less
code, but then a disassembly listing would stop meaning anything on its own, a
chunk would not describe itself, and each invariant (stack balance, jump
targets) would have to be proven once per language.

## Three sections

| Section | Count | What is in it |
|---|---|---|
| `core` | 18 | `CONST NOTHING TRUE FALSE POP DUP`, `GET/SET_GLOBAL`, `GET/SET_LOCAL`, `NOT`, `JUMP`, `JUMP_IF_FALSE`, `CALL`, `RETURN`, `RETURN_NOTHING`, `PRINT`, `HALT` |
| `crumb` | 23 | Crumb's value rules: strict `ADD`…`POW`, `IDIV_TRUNC`, `MOD_TRUNC`, `CONCAT`, `EQ`…`GE`, `CHECK_BOOL`, `AND_JUMP`/`OR_JUMP`, fixed arrays, `CALL_BUILTIN`, `NO_RETURN` |
| `python` | 47 | `TRUTHY`, `JUMP_IF_FALSY_KEEP`/`TRUTHY_KEEP`, `PY_ADD`…`PY_NOT_IN`, lists/tuples/dicts, items, slices, attributes, `CALL_VALUE`, `MAKE_FUNCTION`/`MAKE_CLASS`, `GET_ITER`/`FOR_ITER`, the exception opcodes |

Every opcode in the table records its section, its operand kinds (`const`,
`slot`, `target`, `proc`, `builtin`, `count`, `fmt`, `flag`) and a note on
what it does to the stack. The disassembler annotates operands from those
kinds, so a new opcode shows up correctly without touching the disassembler.
The tests check that the Crumb compiler emits only `core` + `crumb` opcodes
and the MiniPy compiler only `core` + `python`.

## How the shared pieces line up

- **Slots.** Both compilers resolve names to slots at compile time: a flat
  globals array, and a flat slots array per procedure. MiniPy used to look
  globals up by name at run time. Now its compiler gives every module name,
  and every built-in name, a slot. A slot nothing has assigned holds
  `UNBOUND`. A Crumb chunk starts every slot at `Nothing` so it never reads
  `UNBOUND`. A MiniPy chunk starts them `UNBOUND` (except the built-ins, via
  `globalInit`), so `GET_GLOBAL`/`GET_LOCAL` raise a NameError, as Python
  does.
- **Conditions.** `JUMP_IF_FALSE` needs a Boolean in both languages. MiniPy
  emits `TRUTHY` first, unless the expression is already a Boolean (a
  comparison, `not`, `True`/`False`). `not x` is `TRUTHY; NOT`.
- **`and` / `or`.** These differ, so each language has its own opcodes.
  Crumb's `AND_JUMP` checks the operand is a Boolean. MiniPy's
  `JUMP_IF_FALSY_KEEP` uses truthiness and keeps the operand as the result.
- **Printing.** `PRINT n fmt` is shared. The `fmt` operand picks the value
  formatter per instruction: Crumb's `Str` (`Nothing` → empty, `2.0` → `2`) or
  Python's `str()` (`None`, `2.0`). MiniPy compiles `print(...)` to `PRINT`
  when `print` has not been rebound; the built-in `print` still exists as a
  value for code that passes it around.
- **Calls and returns.** Crumb calls procedures known at compile time
  (`CALL proc argc`). MiniPy calls values (`CALL_VALUE argc`: functions,
  bound methods, classes, built-ins). Both push the same kind of frame, and
  both return through the core `RETURN` / `RETURN_NOTHING`. A MiniPy `return`
  inside `try … finally` runs the finally block first, using handler data
  kept on the frame. Crumb frames never have handlers, so the same `RETURN`
  does what it always did.
- **Procedure layout.** MiniPy function and class bodies are now appended
  after the module code, as Crumb's are, so every procedure is one
  contiguous range and the listing shows each one separately.
- **Sleep and transcript.** MiniPy's `sleep(seconds)` sets the same pending
  sleep that Crumb's `Sleep` sets. `CALL_VALUE` yields exactly as
  `CALL_BUILTIN` does, and the Scheduler never knows which language is
  running. `transcript(v)` writes to the same sink as `Transcript`.

## Values

One representation per kind, whichever language made the value
(`src/vm/values.js`):

| Kind | JS | Crumb | MiniPy |
|---|---|---|---|
| Nothing | `null` | `Nothing` | `None` |
| Boolean | boolean | Boolean | `bool` |
| String | string | String | `str` |
| Number | number (double) | Number | `float` |
| Int | **bigint** | never made | `int` |
| Array | `CrumbArray` | Array | never made |
| list, tuple, dict, range, function, class, instance… | classes | never made | yes |

**Numbers.** The option chosen was to add an Int kind rather than squeeze
Python into one numeric type. Crumb's Number and Python's float are the same
IEEE double. Python's `int` is a bigint, so `2 ** 200` and `fib(90)` are
exact, and `4 / 2` prints `2.0`. Only `python` opcodes produce an Int, and
Crumb opcodes never see one. Mixed int/float arithmetic follows Python.
`1 == 1.0` and `{1: x}[1.0]` both work.

The cost is speed: bigint arithmetic makes MiniPy's arithmetic-heavy loops
about 20-45% slower than on its old VM, which stored ints as doubles.
A small-int fast path is the obvious fix if it ever matters.

## Errors

A language-specific opcode reports errors in that language's words, because
only one language ever runs it. A core opcode is shared, so its failures carry
a code (`NAME`, `BOOL`, `BUDGET`, `STACK`, `OPCODE`), and `faults.js` gives
each code's wording per language, along with whether a MiniPy `try` can
catch it. Every failure ends as a `RuntimeFault` with a line and a
traceback. The Crumb loader formats it in the spec's section 11 style; the
MiniPy loader formats it as `file:line: ExcType: message`.

- Crumb: every runtime error is fatal, as section 11 requires.
- MiniPy: operator, index, key, attribute and name errors are exceptions a
  `try` can catch. Running out of stack (`RecursionError`) or out of the
  instruction budget is fatal.

MiniPy exceptions unwind through VM state, not the JS call stack. Each frame
(and module code) keeps its open `except`/`finally` handlers with the stack
depth recorded when the handler was set up. A raise finds the innermost
handler, discarding frames without one and adding them to the traceback.
That is what makes MiniPy resumable. Its old VM recursed in JS once per
Python call, so it could not stop partway through a slice.

## What was not shared, and why

- **Arithmetic and comparison.** Crumb's `ADD` refuses anything but two
  Numbers. Python's `+` covers ints, floats, strings, lists and tuples, and
  `/` always yields a float. Sharing these would have meant one opcode with
  two meanings.
- **Arrays vs lists.** A Crumb Array has a fixed bound and indices `0..n`.
  A Python list grows, and takes negative indices and slices. They are
  separate kinds with separate opcodes.
- **Built-ins.** Crumb's 17 built-ins are resolved at compile time and called
  by index (`CALL_BUILTIN`). Python's are ordinary values in global slots, so
  a program can rebind them or pass them around.

## Known limits

- `break` or `continue` out of a `try` that has a `finally` is a load error.
  Leaving an `except`-only `try` this way works: the compiler pops its
  handler.
- A class body sees only its own names and module globals; there are no
  closures over enclosing functions (unchanged from before).
- Bare `raise` after a nested handler has finished can lose the outer
  exception.

## Verification

- All 136 Crumb tests pass unchanged on the shared VM, apart from import
  paths.
- `test/python/*.py`: 11 programs, 9 of which match CPython's output exactly
  (`int` precision, float formatting, floor division and modulo signs,
  exceptions, classes, comprehensions). The other two check MiniPy's
  uncaught-exception report.
- A further 20 MiniPy tests cover the opcode sections, the formatters,
  unwinding across frames, the fatal limits, `break`/`continue` inside `try`,
  `sleep()` on the Scheduler, and Crumb and MiniPy processes interleaving on
  one Scheduler.
- 20,000 random MiniPy programs, plus every pairing of built-in, method and
  operator with mismatched arguments, ran without a host crash and left the
  value stack balanced.
- The playground bundle runs both languages on the UI scheduler with no page
  errors.
