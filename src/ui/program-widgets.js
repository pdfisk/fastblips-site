// The widgets programs make, in the browser: the VM's widget host (its `gui`
// option) for an AppScreen. It implements the host interface described in
// src/vm/runtime/widgets.js - create / has / classOf / call - with the UI
// toolkit's own classes (docs/widgets.txt), so a BLIP builds its screen from
// the same Buttons, HPanels, ListPanels and Windows the IDE is made of.
//
// Layout. A new widget goes on the screen (the AppScreen's widget layer) at
// its class's default box. On the screen, and in a Panel, a widget sits
// where the program puts it (setLeft, setBounds, ...), or fills the whole
// area after fill(). In an HPanel, VPanel or ButtonBar the panel places it:
// setWidth (in a row) or setHeight (in a column) fixes its size there, and
// setFlex shares out the space left over. Windows float above the rest.

import { Panel } from './widgets/panel.js';
import { HPanel } from './widgets/hpanel.js';
import { VPanel } from './widgets/vpanel.js';
import { ButtonBar } from './widgets/button-bar.js';
import { HSplitPanel } from './widgets/hsplit-panel.js';
import { VSplitPanel } from './widgets/vsplit-panel.js';
import { TabPanel } from './widgets/tab-panel.js';
import { TextPanel } from './widgets/text-panel.js';
import { MonacoPanel } from './widgets/monaco-panel.js';
import { ListPanel } from './widgets/list-panel.js';
import { Button } from './widgets/button.js';
import { Label } from './widgets/label.js';
import { Menu } from './widgets/menu.js';
import { Spacer } from './widgets/spacer.js';
import { Window } from './windows/window.js';
import { WidgetError } from '../vm/runtime/widgets.js';

const STYLE = `
.cr-app-widgets .cr-window-minimize{display:none}
.cr-app-menu .cr-menu-button{box-sizing:border-box;width:100%;border:1px solid transparent;
  border-radius:var(--cr-radius-button);background:var(--cr-button-bg);color:var(--cr-button-text);
  box-shadow:var(--cr-button-shadow)}
.cr-app-menu .cr-menu-button::after{content:' \\25BE'}
.cr-app-menu .cr-menu-button:hover,.cr-app-menu.open .cr-menu-button{background:var(--cr-button-hover);
  color:var(--cr-button-text)}
`;

function installStyle() {
  if (document.getElementById('cr-app-widgets-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-app-widgets-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** Places the children of the screen or of a Panel: where the program put
 *  them, or filling the area. Windows place themselves. */
function layoutFree(panel) {
  const { width, height } = panel.bounds;
  for (const child of panel.children) {
    if (child instanceof Window) continue;
    if (child.fillParent) child.setBounds(0, 0, width, height);
    else if (child.box) child.setBounds(...child.box);
  }
}

/** The layer holding the program's top-level widgets, laid over the
 *  AppScreen's text; clicks elsewhere go through to the text. */
export class FreeLayer extends Panel {
  constructor() {
    super();
    installStyle();
    this.element.classList.add('cr-app-widgets');
    this.element.style.pointerEvents = 'none';
  }

  /** The program's Windows, back to front (Window.refreshActive uses it). */
  get windows() {
    return this._children.filter((c) => c instanceof Window)
      .sort((a, b) => (Number(a.element.style.zIndex) || 0) - (Number(b.element.style.zIndex) || 0));
  }

  layout() {
    layoutFree(this);
    super.layout();
  }
}

/** A program's Panel: children placed where the program puts them. */
class FreePanel extends Panel {
  constructor() {
    super();
    this.element.classList.add('cr-app-panel');
  }

  layout() {
    layoutFree(this);
    super.layout();
  }
}

/** A program's Label: normal text colour, opaque, left-aligned. */
export class AppLabel extends Label {
  constructor(text) {
    super(text);
    this.element.classList.add('cr-app-label');
    this.element.style.color = 'var(--cr-text)';
    // Opaque, so text the program printed underneath does not show through.
    this.element.style.background = 'var(--cr-output-bg)';
    this.element.style.font = 'var(--cr-font-size) var(--cr-font-ui)';
  }
}

/** className -> (constructor args) -> widget, and its default box. */
const CLASSES = {
  Label: { make: (text) => new AppLabel(text), box: [0, 0, 100, 24] },
  Button: { make: (text) => new Button(text), box: [0, 0, 100, 32] },
  Menu: {
    make: (text) => {
      const menu = new Menu(text);
      menu.element.classList.add('cr-app-menu');
      return menu;
    },
    box: [0, 0, 90, 28],
  },
  Spacer: { make: () => new Spacer(), box: [0, 0, 0, 0] },
  Panel: { make: () => new FreePanel(), box: [0, 0, 320, 200] },
  HPanel: { make: () => new HPanel(), box: [0, 0, 320, 32] },
  VPanel: { make: () => new VPanel(), box: [0, 0, 320, 200] },
  ButtonBar: { make: () => new ButtonBar(), box: [0, 0, 320, 30] },
  HSplitPanel: { make: () => new HSplitPanel(), box: [0, 0, 320, 200] },
  VSplitPanel: { make: () => new VSplitPanel(), box: [0, 0, 320, 200] },
  TabPanel: { make: () => new TabPanel(), box: [0, 0, 320, 200] },
  Window: { make: (title) => new Window({ title, x: 20, y: 20, width: 320, height: 240 }), box: null },
  TextPanel: { make: (text) => new TextPanel({ text }), box: [0, 0, 240, 120] },
  MonacoPanel: { make: (text, language) => new MonacoPanel({ text, language }), box: [0, 0, 320, 200] },
  ListPanel: { make: () => new ListPanel(), box: [0, 0, 160, 160] },
};

/** Classes whose natural width is their text's. */
const TEXT_SIZED = new Set(['Label', 'Button', 'Menu']);

/**
 * The VM's widget host for an AppScreen. Widgets get ids from 1; every
 * widget the program can reach (including a Window's ButtonBar, and Buttons
 * made by addButton) is registered with one.
 */
export class ProgramWidgetHost {
  constructor(layer) {
    this.layer = layer;
    this._widgets = new Map();       // id -> widget
    this._ids = new Map();           // widget -> id
    this._nextId = 1;
    this._nextItem = 1;              // ListPanel item values
  }

  /** The widget with this id, or undefined. */
  widget(id) { return this._widgets.get(id); }

  /** Every widget, oldest first. */
  get widgets() { return [...this._widgets.values()]; }

  /** Removes every widget; ids start from 1 again. */
  clear() {
    for (const child of this.layer.children) {
      if (child instanceof Menu) child.close();
      this.layer.remove(child);
    }
    for (const w of this._widgets.values()) if (w instanceof Menu) w.close();
    this._widgets.clear();
    this._ids.clear();
    this._nextId = 1;
  }

  _register(widget, className) {
    widget.programClass = className;
    widget.element.style.pointerEvents = 'auto';
    const id = this._nextId++;
    widget.element.dataset.widgetId = String(id);
    this._widgets.set(id, widget);
    this._ids.set(widget, id);
    return id;
  }

  _idOf(widget) {
    if (!widget) return 0;
    return this._ids.get(widget) ?? 0;
  }

  create(className, args) {
    const spec = CLASSES[className];
    if (!spec) throw new WidgetError(`there is no widget class '${className}'`);
    const widget = spec.make(...args);
    if (spec.box) {
      widget.box = [...spec.box];
      // In a VPanel a widget with no height of its own gets its class's
      // default height; in an HPanel, a widget with no text to measure gets
      // its default width.
      const [, , width, height] = spec.box;
      widget.preferredHeight = () => height;
      if (!TEXT_SIZED.has(className)) widget.preferredWidth = () => width;
    }
    const id = this._register(widget, className);
    this.layer.add(widget);
    if (widget instanceof Window) widget.bringToFront();
    this.layer.layout();
    return id;
  }

  has(id) { return this._widgets.has(id); }

  classOf(id) { return this._widgets.get(id)?.programClass; }

  /** Lays out what changed: the widget's parent (or the widget itself). */
  _relayout(widget) {
    const parent = widget.parent;
    if (parent && parent !== this.layer) parent.layout();
    else if (parent === this.layer) this.layer.layout();
    else widget.layout();
  }

  _child(id) {
    const child = this._widgets.get(id);
    if (!child) throw new WidgetError('that widget no longer exists');
    return child;
  }

  /** A child for a container: not a Window, and not the container or one of its ancestors. */
  _placeable(container, id) {
    const child = this._child(id);
    if (child instanceof Window) throw new WidgetError('a Window floats on the screen: it cannot go inside another widget');
    if (child === container || child.element.contains(container.element)) {
      throw new WidgetError('a widget cannot go inside itself');
    }
    return child;
  }

  _index(i, n, what = 'index') {
    if (i < 0 || i >= n) {
      throw new WidgetError(n === 0 ? `${what} ${i}: there are none` : `${what} ${i} is out of range 0..${n - 1}`);
    }
    return i;
  }

  /** The element whose colours the program sets: a list's or text box's own, else the widget's. */
  _surface(w) {
    if (w instanceof ListPanel) return w.list;
    if (w instanceof TextPanel) return w.textArea;
    return w.element;
  }

  /** Sets part of the program's box, and the fixed size a row or column uses. */
  _setBox(w, left, top, width, height) {
    if (w instanceof Window) {
      const b = w.bounds;
      w.setBounds(left ?? b.x, top ?? b.y, width ?? b.width, height ?? b.height);
      return;
    }
    const box = w.box ?? [0, 0, 0, 0];
    w.box = [left ?? box[0], top ?? box[1], width ?? box[2], height ?? box[3]];
    if (width !== undefined) w.fixedWidth = width;
    if (height !== undefined) w.fixedHeight = height;
    this._relayout(w);
  }

  call(id, method, args) {
    const w = this._widgets.get(id);
    const cls = w.programClass;
    const [a, b] = args;
    switch (method) {
      // ---- every widget
      case 'setLeft': return this._setBox(w, a);
      case 'setTop': return this._setBox(w, undefined, a);
      case 'setWidth': return this._setBox(w, undefined, undefined, a);
      case 'setHeight': return this._setBox(w, undefined, undefined, undefined, a);
      case 'setBounds': return this._setBox(w, ...args);
      case 'getLeft': return w.bounds.x;
      case 'getTop': return w.bounds.y;
      case 'getWidth': return w.bounds.width;
      case 'getHeight': return w.bounds.height;
      case 'setFlex': w.flex = a; return this._relayout(w);
      case 'fill':
        if (w instanceof Window) { w.maximize(); return undefined; }
        w.fillParent = true;
        return this._relayout(w);
      case 'setVisible':
        w.visible = a;
        if (w instanceof Window) Window.refreshActive(w.parent);
        return this._relayout(w);
      case 'isVisible': return w.visible;
      case 'setBackground': this._surface(w).style.background = a; return undefined;
      case 'setColor': this._surface(w).style.color = a; return undefined;
      case 'getParent': return this._idOf(w.parent);
      case 'remove': {
        const parent = w.parent;
        if (!parent) return undefined;
        parent.remove(w);
        if (w instanceof Window) Window.refreshActive(parent);
        if (parent !== this.layer) parent.layout();
        return undefined;
      }
      default: break;
    }

    switch (`${cls}.${method}`) {
      // ---- text
      case 'Label.setText': w.text = a; return undefined;
      case 'Label.getText': return w.text;
      case 'Button.setText': case 'Menu.setText':
        w.label = a;
        return this._relayout(w);
      case 'Button.getText': case 'Menu.getText': return w.label;
      case 'TextPanel.setText': case 'MonacoPanel.setText': w.text = a; return undefined;
      case 'TextPanel.getText': case 'MonacoPanel.getText': return w.text;

      // ---- clicks
      case 'Label.onClick': case 'Button.onClick':
        w.element.addEventListener('click', () => a());
        return undefined;
      case 'Button.setEnabled': w.enabled = a; return undefined;
      case 'Button.isEnabled': return w.enabled;

      // ---- Menu
      case 'Menu.addItem': w.addItem(a, () => b(a)); return undefined;
      case 'Menu.addSeparator': w.addSeparator(); return undefined;
      case 'Menu.clear': w.close(); w.items = []; return undefined;

      // ---- containers
      case 'Panel.add': case 'HPanel.add': case 'VPanel.add': case 'ButtonBar.add': {
        const child = this._placeable(w, a);
        w.add(child);
        w.layout();
        return undefined;
      }
      case 'Panel.getCount': case 'HPanel.getCount': case 'VPanel.getCount': case 'ButtonBar.getCount':
        return w.children.length;
      case 'Panel.getChild': case 'HPanel.getChild': case 'VPanel.getChild': case 'ButtonBar.getChild':
        return this._idOf(w.children[this._index(a, w.children.length)]);
      case 'Panel.clear': case 'HPanel.clear': case 'VPanel.clear': case 'ButtonBar.clear':
        for (const child of w.children) w.remove(child);
        w.layout();
        return undefined;
      case 'HPanel.setPadding': case 'VPanel.setPadding': w.padding = a; w.layout(); return undefined;
      case 'HPanel.setSpacing': case 'VPanel.setSpacing': w.spacing = a; w.layout(); return undefined;
      case 'ButtonBar.addButton': {
        const button = new Button(a);
        button.box = [...CLASSES.Button.box];
        button.preferredHeight = () => CLASSES.Button.box[3];
        const buttonId = this._register(button, 'Button');
        w.add(button);
        return buttonId;
      }

      // ---- split panels
      case 'HSplitPanel.setFirst': case 'VSplitPanel.setFirst': w.first = this._placeable(w, a); return undefined;
      case 'HSplitPanel.setSecond': case 'VSplitPanel.setSecond': w.second = this._placeable(w, a); return undefined;
      case 'HSplitPanel.getFirst': case 'VSplitPanel.getFirst': return this._idOf(w.first);
      case 'HSplitPanel.getSecond': case 'VSplitPanel.getSecond': return this._idOf(w.second);
      case 'HSplitPanel.setPosition': case 'VSplitPanel.setPosition': w.position = a; return undefined;
      case 'HSplitPanel.getPosition': case 'VSplitPanel.getPosition': return w.position;
      case 'HSplitPanel.onChange': case 'VSplitPanel.onChange':
        w.element.addEventListener('change', (e) => {
          if (e.target === w.element) a(e.detail.position);
        });
        return undefined;

      // ---- TabPanel
      case 'TabPanel.addTab': w.addTab(a, this._placeable(w, b)); w.layout(); return undefined;
      case 'TabPanel.select': w.select(this._index(a, w.labels.length, 'tab')); return undefined;
      case 'TabPanel.getSelectedIndex': return w.selectedIndex;
      case 'TabPanel.getSelectedText': return w.selectedLabel ?? '';
      case 'TabPanel.getCount': return w.labels.length;
      case 'TabPanel.onSelect':
        w.element.addEventListener('select', (e) => {
          if (e.target === w.element) a(e.detail.index);
        });
        return undefined;

      // ---- Window
      case 'Window.setTitle': w.title = a; return undefined;
      case 'Window.getTitle': return w.title;
      case 'Window.setContent': w.content = this._placeable(w, a); return undefined;
      case 'Window.getContent': return this._idOf(w.content);
      case 'Window.getButtonBar':
        return this._idOf(w.buttonBar) || this._register(w.buttonBar, 'ButtonBar');
      case 'Window.open': w.open(this.layer); return undefined;
      case 'Window.close': w.close(); return undefined;
      case 'Window.maximize': w.maximize(); return undefined;
      case 'Window.restore': w.restore(); return undefined;
      case 'Window.isMaximized': return w.maximized;
      case 'Window.onClose':
        w.element.addEventListener('close', (e) => {
          if (e.target === w.element) a();
        });
        return undefined;

      // ---- TextPanel and MonacoPanel
      case 'TextPanel.append': case 'MonacoPanel.append': w.append(a); return undefined;
      case 'TextPanel.setReadOnly': case 'MonacoPanel.setReadOnly': w.readOnly = a; return undefined;
      case 'TextPanel.isReadOnly': case 'MonacoPanel.isReadOnly': return w.readOnly;
      case 'TextPanel.focus': case 'MonacoPanel.focus': w.focus(); return undefined;
      case 'TextPanel.onChange': case 'MonacoPanel.onChange':
        w.element.addEventListener('change', (e) => {
          if (e.target === w.element) a(w.text);
        });
        return undefined;
      case 'TextPanel.onSubmit': case 'MonacoPanel.onSubmit':
        w.element.addEventListener('submit', (e) => {
          if (e.target === w.element) a();
        });
        return undefined;

      // ---- ListPanel
      case 'ListPanel.addItem': w.addItem({ label: a, value: this._nextItem++ }); return undefined;
      case 'ListPanel.removeItem': w.removeItem(this._index(a, w.items.length)); return undefined;
      case 'ListPanel.setItem': {
        const old = w.items[this._index(a, w.items.length)];
        w.replaceItem(a, { label: b, value: old.value });
        return undefined;
      }
      case 'ListPanel.getItem': return w.items[this._index(a, w.items.length)].label;
      case 'ListPanel.getCount': return w.items.length;
      case 'ListPanel.clear': w.items = []; return undefined;
      case 'ListPanel.select':
        w.select(a === -1 ? -1 : this._index(a, w.items.length));
        return undefined;
      case 'ListPanel.getSelectedIndex': return w.selectedIndex;
      case 'ListPanel.getSelectedText': return w.selectedItem?.label ?? '';
      case 'ListPanel.setEmptyText': w.emptyText = a; w.items = w.items; return undefined;
      case 'ListPanel.onSelect':
        w.element.addEventListener('select', (e) => {
          if (e.target === w.element) a(e.detail.index);
        });
        return undefined;

      default:
        throw new WidgetError(`a ${cls} has no method '${method}'`);
    }
  }
}

