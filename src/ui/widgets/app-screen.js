// AppScreen: the screen a program runs on, in a LaunchWindow and on the
// ?run= page (see docs/widgets.txt). A TextPanel fills it (the program's
// Print output), and the widgets the program makes (New Button, New Label,
// ...) float above the text at the positions it gives them.
//
// screen.host (a WidgetHost) is the VM's widget host, its `gui` option: it
// implements create / has / setText / getText / setBounds / onClick, as
// described in src/vm/runtime/widgets.js.

import { Panel } from './panel.js';
import { TextPanel } from './text-panel.js';
import { Button } from './button.js';
import { Label } from './label.js';

// The layer holding the program's widgets: laid over the text, letting
// clicks through to it except on the widgets themselves.
class WidgetLayer extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-app-widgets');
    this.element.style.pointerEvents = 'none';
  }

  /** The program places its widgets itself: only lay out their insides. */
  layout() {
    for (const child of this.children) child.layout();
  }
}

// A program's Label: normal text colour, and (unlike a ButtonBar Label)
// left-aligned in whatever box the program gives it.
class AppLabel extends Label {
  constructor(text) {
    super(text);
    this.element.classList.add('cr-app-label');
    this.element.style.color = 'var(--cr-text)';
    // Opaque, so text the program printed underneath does not show through.
    this.element.style.background = 'var(--cr-output-bg)';
    this.element.style.font = 'var(--cr-font-size) var(--cr-font-ui)';
  }
}

/**
 * The VM's widget host for an AppScreen (its `gui` option): puts the
 * program's widgets on the screen's widget layer. Implements the interface
 * described in src/vm/runtime/widgets.js.
 */
export class WidgetHost {
  constructor(layer) {
    this.layer = layer;
    this._widgets = new Map();   // id -> Button | AppLabel
    this._nextId = 1;
  }

  /** The widget with this id, or undefined. */
  widget(id) { return this._widgets.get(id); }

  /** Every widget, oldest first. */
  get widgets() { return [...this._widgets.values()]; }

  /** Removes every widget; ids start from 1 again. */
  clear() {
    for (const widget of this._widgets.values()) this.layer.remove(widget);
    this._widgets.clear();
    this._nextId = 1;
  }

  create(kind, text, left, top, width, height) {
    const widget = kind === 'button' ? new Button(text) : new AppLabel(text);
    widget.element.classList.add(`cr-app-${kind}`);
    widget.element.style.pointerEvents = 'auto';
    const id = this._nextId++;
    widget.element.dataset.widgetId = String(id);
    this._widgets.set(id, widget);
    this.layer.add(widget);
    widget.setBounds(left, top, width, height);
    return id;
  }

  has(id) { return this._widgets.has(id); }

  setText(id, text) {
    const widget = this._widgets.get(id);
    if (widget instanceof Button) widget.label = text;
    else widget.text = text;
  }

  getText(id) {
    const widget = this._widgets.get(id);
    return widget instanceof Button ? widget.label : widget.text;
  }

  setBounds(id, left, top, width, height) {
    this._widgets.get(id).setBounds(left, top, width, height);
  }

  onClick(id, callback) {
    this._widgets.get(id).element.addEventListener('click', () => callback());
  }
}

export class AppScreen extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-app-screen');
    this.element.style.background = 'var(--cr-output-bg)';
    this.textPanel = this.add(new TextPanel());
    this.widgetLayer = this.add(new WidgetLayer());
    /** The VM's widget host (pass it as the `gui` option). */
    this.host = new WidgetHost(this.widgetLayer);
  }

  layout() {
    const { width, height } = this.bounds;
    this.textPanel.setBounds(0, 0, width, height);
    this.widgetLayer.setBounds(0, 0, width, height);
    super.layout();
  }

  /** Removes every widget the program added (Go and Reset do this). */
  clearWidgets() { this.host.clear(); }

  /** An AppScreen holds only its text and its widget layer. */
  add(child) {
    if (this.children.length >= 2) throw new Error('AppScreen cannot contain other widgets');
    return super.add(child);
  }
}
