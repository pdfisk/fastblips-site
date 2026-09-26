// Widgets for programs: the part of AddButton / add_button and friends that
// both languages share. The builtins check their arguments in their own
// language's style, then call these.
//
// The widgets themselves belong to the host (in the browser, the screen of a
// LaunchWindow or of the ?run= page), passed to the VM as the `gui` option.
// A host implements:
//
//   create(kind, text, left, top, width, height) -> id   kind: 'button' | 'label'
//   has(id) -> boolean
//   setText(id, text)
//   getText(id) -> string
//   setBounds(id, left, top, width, height)
//   onClick(id, callback)      calls callback() each time the widget is clicked
//
// Ids are whole Numbers from 1. Positions and sizes are CSS pixels from the
// top left of the screen. Without a host (the command line, a console) the
// widget builtins are runtime errors.

/** The host, or throws via fail(message) if the VM has none. */
export function hostFor(vm, fnName, fail) {
  if (!vm.gui) {
    fail(`${fnName} needs a screen to put widgets on: run the program from a launch window (the console's Launch menu) or a ?run= page`);
  }
  return vm.gui;
}

/** Checks that id names a widget on the host. */
export function checkWidget(gui, fnName, id, fail) {
  if (!gui.has(id)) fail(`${fnName}: there is no widget ${id}`);
  return id;
}

/**
 * Checks a box (left, top, width, height), already converted to JS numbers.
 * Returns it rounded to whole pixels.
 */
export function checkBox(fnName, [left, top, width, height], fail) {
  for (const [name, v] of [['left', left], ['top', top], ['width', width], ['height', height]]) {
    if (!Number.isFinite(v)) fail(`${fnName} expects a finite ${name}, got ${v}`);
  }
  if (width < 0 || height < 0) fail(`${fnName} expects a width and height of 0 or more, got ${width} x ${height}`);
  return [left, top, width, height].map(Math.round);
}
