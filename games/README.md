# Games

Five small games in MiniPy for FastBlips. Each is a self-contained `.py` file with comments for learners. They run on a phone or a desktop browser (tap or click) and are tested headless in `test/games.test.js`.

| Game | File | What it shows |
|---|---|---|
| Lights Out | `lights-out.py` | Canvas, a puzzle that is always solvable, a seeded random generator |
| Flood-It | `flood-it.py` | Lists of lists, flood fill with a stack, a palette |
| Connect Four | `connect-four.py` | A computer opponent (negamax with alpha-beta), a falling-disc animation |
| Tower Drop | `tower-drop.py` | Physics: stacking blocks, `on_collide`, lives |
| Plinko | `plinko.py` | Physics: pegs, bouncy balls, scored slots, nudging |

## Run one

Open a Python console (File > New Python), paste the file, then **Launch > Mobile** (phone-sized window) or **Launch > Desktop**. The console's own **Run** works too, but it dims the output while the program runs; use Launch for true colours.

## Why no game loops

A MiniPy program receives clicks only when it is idle, so a `while True:` loop never sees a tap. These games redraw inside the click handler (Canvas) or let the physics world run on its own (Physics). A real-time game with a loop works with the keyboard (`is_key_down`) but not with taps until there is a frame callback.

## MiniPy things these games work around

No math functions (the games use their own seeded `rand()` so levels repeat; `random()`, `randint()`, `choice()` and `shuffle()` are built in for when they should not), no `global` (state lives in a dict), no ternary, no `round`/`enumerate`/`zip`/`chr`/`ord`, no `%` string formatting.

## Test

`npm test` runs `test/games.test.js` with the rest of the suite.
