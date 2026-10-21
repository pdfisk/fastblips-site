# FastBlips Applications

*Expanded from the original notes: applications are
run from the database, work on desktop and mobile, and the runtime is open
source.*

## 1. What a FastBlips application is

An application is a BLIP: one program (Crumb or MiniPy), plus any screens and
composites it loads, stored as records on the FastBlips server and run by the
FastBlips runtime in the viewer's browser.

```
  record in database ──▶ https://fastblips.com/?run=<name> ──▶ runtime in the page
  (source; later bytecode)                                        compiler · VM · scheduler
  + saved screens/composites                                      · widget host
```

## 2. Running apps from the database

**Today.**
- Saving a program in the Database window publishes it; `?run=<name>` runs
  it full-page. The table it is found in (Basic first, then Python) decides
  the language.
- Screens and composites are loaded at run time by name
  (`vp.load`, `vp.loadComposite`).
- Every BLIP is untrusted at the VM level: instruction budget, frame limit,
  no DOM access except through widgets and built-ins.

**Still needed.**
- **Owners and access control** — who can edit, who can run, public vs
  private apps.
- **Versions** — a published version that keeps running while the author
  edits a draft.
- **Bytecode delivery** — so `?run=` need not compile (see *02 BLIP definition*, Next steps 3).
- **Friendly URLs** — e.g. `fastblips.com/app/<name>` or
  `<name>.fastblips.com`, with a title and icon for sharing previews.
- **Limits** for network built-ins (`Fetch` rate, per-app storage).

## 3. Desktop and mobile apps

The same app runs on both. What makes that work, and what is missing:

| Area | Today | Needed |
|---|---|---|
| Layout | HPanel/VPanel, flex, `fill()` | Screen size and resize events |
| Input | Clicks, TextPanel, ListPanel | TextBox, touch, keyboard events |
| Preview | *Launch → Desktop / Mobile* (360 × 640) | Tablet and landscape sizes |
| Install | — | PWA manifest + service worker per app |
| Offline | — | Cache runtime + chunk; local storage for app data |

## 4. Open-source runtime

**Proposal.** Open-source the parts needed to *run* a BLIP; keep the
hosted service (database, accounts, gallery, forum) as the FastBlips site.

| Open source (runtime) | Hosted service |
|---|---|
| Crumb and MiniPy compilers | Program and screen database |
| Shared instruction set and VM | Accounts, owners, permissions |
| Scheduler | Gallery, search, forum |
| Widget toolkit and `ProgramWidgetHost` | Analytics, quotas |
| `crumb` command-line tool | |

Why: people trust a runtime they can read; teachers and companies can
self-host; others can write new hosts (a canvas host, a native shell) or
new front ends against the documented instruction set.

**Current state.** `package.json` already declares `"license": "MIT"`, but
there is no `LICENSE` file and no public repository yet.

**To do before publishing.**
- Add a `LICENSE` file and decide whether the IDE/playground is included.
- Split the repository (or the build) into runtime and site.
- A short README for embedders: load the runtime, compile, run a chunk,
  provide a widget host.
- Document the bytecode format once it is versioned, so it becomes a
  stable public contract.
- A contribution guide and a test command that runs on a clean checkout
  (`npm test` already exists).

## 5. Kinds of application to target

Good fits for an interpreted, browser-based, easily shared program. The
first audience is learners, so teaching apps and small games come first:

| Category | Examples | Uses |
|---|---|---|
| Teaching | Exercises, step-through demos, quizzes | Crumb's strict errors, Process window |
| Small data apps | Weather, holidays, prices, book search (`docs/apis.md`) | `Fetch`, ListPanel, Chart (planned) |
| Forms and records | Sign-up sheets, inventories, order forms | Designer, TextBox, app storage (planned) |
| Games | Quiz, tic-tac-toe, Sudoku, life, simple sprites | Board, Canvas, Timer (planned) |
| Utilities | Calculators, converters, timers, checklists | Widgets, PWA install |
| Dashboards | Several BLIPs side by side, each polling a source | Scheduler, Timer |

Less suited: heavy graphics, large numeric work, anything needing native
device access — unless done in JavaScript built-ins.

## 6. Showcase and templates

A set of polished example apps doubles as documentation, templates and
marketing:

1. **Weather now** — Fetch + Labels; desktop and phone.
2. **Quiz** — Open Trivia DB, buttons, score.
3. **To-do list** — TextBox, ListPanel, app storage.
4. **Tic-tac-toe** — Board widget, two players.
5. **Order form** — built in the Designer, saved to a collection.
6. **Two-language demo** — Crumb UI talking to a MiniPy worker (needs
   message passing).

Each should open in the IDE with one click ("Open a copy"), so it is
also a starting point. For learners, each also needs a short step-by-step
tutorial that builds it from an empty program.

## Open points

- Should apps be able to call each other (link to another BLIP, pass data)?
- Paid or private apps — is there a business model, and does it affect
  the licence choice?
