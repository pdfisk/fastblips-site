// DesignerWindow: the GUI designer. It loads, edits and saves composite
// widgets - a widget and everything in it, kept by name in the database's
// viewports table - which programs then use with vp.loadComposite(name)
// (see docs/widgets.txt, "GUI designer").
//
// On the left, the Outline (the composite's widgets as a tree) above the
// Palette (the classes); in the middle, a live Preview built from the real
// toolkit classes by a ProgramWidgetHost; on the right, the Properties of
// the widget selected. Click a widget in the Preview or the Outline to
// select it. Where it is placed freely (the root, or in a Panel) it can be
// dragged to move it, and resized by its corner grip. Rows, columns, tabs
// and splits are arranged with Add, Delete, Up and Down. Test switches the
// Preview from designing to using it (buttons click, lists scroll). Code
// shows the Basic or Python program that builds the design
// (designer-code-window.js).
//
// The model - the node tree, the fields - is in ../designer-model.js.

import { Window } from './window.js';
import { Widget } from '../widgets/widget.js';
import { Panel } from '../widgets/panel.js';
import { VPanel } from '../widgets/vpanel.js';
import { HSplitPanel } from '../widgets/hsplit-panel.js';
import { VSplitPanel } from '../widgets/vsplit-panel.js';
import { ListPanel } from '../widgets/list-panel.js';
import { Label } from '../widgets/label.js';
import { Menu } from '../widgets/menu.js';
import { Spacer } from '../widgets/spacer.js';
import {
  FreeLayer, ProgramWidgetHost, fetchDoc, storeDoc, listDocs,
} from '../program-widgets.js';
import {
  PALETTE, newNode, addChild, removeNode, moveNode, parentOf, canAdd, outline,
  fieldsFor, getField, setField, toDoc,
} from '../designer-model.js';
import { DesignerCodeWindow } from './designer-code-window.js';

const STYLE = `
.cr-designer-caption{font:bold var(--cr-font-size-small) var(--cr-font-ui);color:var(--cr-text-muted);
  background:var(--cr-buttonbar-bg);border-bottom:1px solid var(--cr-buttonbar-border);padding:0 6px}
.cr-designer-preview{background:var(--cr-output-bg);overflow:hidden;
  background-image:radial-gradient(var(--cr-divider) 1px,transparent 1px);background-size:10px 10px}
.cr-designer-select{position:absolute;pointer-events:none;outline:2px solid var(--cr-accent);
  outline-offset:-1px;z-index:99999;box-sizing:border-box}
.cr-designer-grip{position:absolute;right:-5px;bottom:-5px;width:9px;height:9px;background:var(--cr-accent);
  pointer-events:auto;cursor:nwse-resize}
.cr-designer-inspector{position:absolute;inset:0;overflow:auto;padding:6px 8px;box-sizing:border-box;
  background:var(--cr-window-bg);color:var(--cr-text);font:var(--cr-font-size) var(--cr-font-ui)}
.cr-designer-inspector h4{margin:10px 0 4px;font-size:var(--cr-font-size-small);color:var(--cr-text-muted);
  text-transform:uppercase;letter-spacing:.04em}
.cr-designer-inspector h3{margin:0 0 2px;font-size:var(--cr-font-size)}
.cr-designer-row{display:grid;grid-template-columns:92px 1fr;gap:6px;align-items:center;margin:3px 0}
.cr-designer-row input[type=text],.cr-designer-row textarea{box-sizing:border-box;width:100%;min-width:0;
  font:var(--cr-font-size) var(--cr-font-ui);background:var(--cr-input-bg);color:var(--cr-text);
  border:1px solid var(--cr-buttonbar-border);padding:2px 4px}
.cr-designer-row textarea{font-family:var(--cr-font-code);resize:vertical}
.cr-designer-row label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr-designer-hint{color:var(--cr-text-faint);font-size:var(--cr-font-size-small);margin:2px 0 6px}
.cr-designer-name{box-sizing:border-box;font:inherit;background:var(--cr-input-bg);color:var(--cr-text);
  border:1px solid var(--cr-buttonbar-border);padding:0 4px}
`;

function installStyle() {
  if (document.getElementById('cr-designer-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-designer-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** A caption above a widget, in a column. */
function titled(caption, widget) {
  const column = new VPanel();
  const label = new Label(caption);
  label.element.classList.add('cr-designer-caption');
  label.fixedHeight = 20;
  column.add(label);
  widget.flex = 1;
  column.add(widget);
  return column;
}

/** A one-line text field for a ButtonBar: the composite's name. */
class NameField extends Widget {
  constructor(placeholder) {
    super('input');
    this.element.type = 'text';
    this.element.placeholder = placeholder;
    this.element.className += ' cr-designer-name';
    this.element.setAttribute('aria-label', placeholder);
    this.fixedWidth = 150;
  }

  get value() { return this.element.value.trim(); }
  set value(text) { this.element.value = text; }
}

// ------------------------------------------------------------ the preview

/** The composite, built from the real widgets, with the selection drawn on it. */
class PreviewPanel extends Panel {
  constructor(designer) {
    super();
    this.designer = designer;
    this.element.classList.add('cr-designer-preview');
    this.layer = this.add(new FreeLayer());
    this.layer.element.style.pointerEvents = 'auto';
    this.host = new ProgramWidgetHost(this.layer);
    this.testing = false;
    this.nodeOf = new Map();      // widget -> node
    this.widgetOf = new Map();    // node -> widget

    this.selectBox = document.createElement('div');
    this.selectBox.className = 'cr-designer-select';
    this.grip = document.createElement('div');
    this.grip.className = 'cr-designer-grip';
    this.grip.title = 'Drag to resize';
    this.selectBox.appendChild(this.grip);
    this.element.appendChild(this.selectBox);

    // In design mode a press selects (and may drag); nothing reaches the widgets.
    const swallow = (e) => { if (!this.testing) { e.preventDefault(); e.stopPropagation(); } };
    this.element.addEventListener('pointerdown', (e) => this._press(e), true);
    for (const type of ['click', 'dblclick', 'mousedown', 'contextmenu']) this.element.addEventListener(type, swallow, true);
  }

  /** Rebuilds the preview from the designer's tree. */
  render() {
    const { root } = this.designer;
    this.host.clear();
    this.nodeOf.clear();
    this.widgetOf.clear();
    this.error = null;
    try {
      const widget = this.host.build(root, (w, node) => {
        this.nodeOf.set(w, node);
        this.widgetOf.set(node, w);
      });
      this.layer.add(widget);
      if (widget instanceof Window) {
        // Its own title-bar buttons would close or shrink it: design it instead.
        widget.element.querySelectorAll('.cr-window-tool').forEach((b) => { b.style.visibility = 'hidden'; });
        widget.bringToFront();
      }
    } catch (err) {
      this.error = err.message;
    }
    this.layout();
    this.reveal(this.designer.selected);
  }

  layout() {
    const { width, height } = this.bounds;
    this.layer.setBounds(0, 0, width, height);
    super.layout();
    this.drawSelection();
  }

  /** Shows the tab (of any TabPanel above it) that holds node. */
  reveal(node) {
    let child = node;
    for (let parent = parentOf(this.designer.root, child); parent; child = parent, parent = parentOf(this.designer.root, parent)) {
      if (parent.class !== 'TabPanel') continue;
      const index = parent.tabs.findIndex((t) => t.widget === child);
      const tabs = this.widgetOf.get(parent);
      if (tabs && index >= 0) tabs.select(index);
    }
    this.drawSelection();
  }

  drawSelection() {
    const box = this.selectBox;
    const widget = this.widgetOf.get(this.designer.selected);
    if (this.testing || !widget || !widget.element.isConnected) { box.style.display = 'none'; return; }
    const r = widget.element.getBoundingClientRect();
    const p = this.element.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { box.style.display = 'none'; return; }
    Object.assign(box.style, {
      display: 'block', left: `${r.left - p.left}px`, top: `${r.top - p.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    });
    this.grip.style.display = this.designer.isFree(this.designer.selected) ? 'block' : 'none';
  }

  /** The node shown by the element pressed, or the root. */
  _nodeAt(target) {
    for (let el = target; el && el !== this.element; el = el.parentElement) {
      const id = el.dataset?.widgetId;
      const node = id && this.nodeOf.get(this.host.widget(Number(id)));
      if (node) return node;
    }
    return this.designer.root;
  }

  _press(e) {
    if (this.testing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const resizing = e.target === this.grip;
    const node = resizing ? this.designer.selected : this._nodeAt(e.target);
    if (!resizing) this.designer.select(node);
    if (!this.designer.isFree(node)) return;
    this._drag(e, node, resizing);
  }

  /** Moves (or with the grip, resizes) a freely placed widget, then records its new box. */
  _drag(down, node, resizing) {
    const widget = this.widgetOf.get(node);
    if (!widget) return;
    const b = widget.bounds;
    const start = [b.x, b.y, b.width, b.height];
    const target = down.target;
    target.setPointerCapture?.(down.pointerId);
    let moved = false;
    const onMove = (e) => {
      const dx = Math.round(e.clientX - down.clientX);
      const dy = Math.round(e.clientY - down.clientY);
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      const box = resizing
        ? [start[0], start[1], Math.max(8, start[2] + dx), Math.max(8, start[3] + dy)]
        : [start[0] + dx, start[1] + dy, start[2], start[3]];
      widget.setBounds(...box);
      widget.layout();
      this.drawSelection();
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      if (!moved) return;
      const nb = widget.bounds;
      this.designer.setPlace(node, resizing
        ? { width: nb.width, height: nb.height }
        : { left: nb.x, top: nb.y });
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
}

// ------------------------------------------------------------ the inspector

/** The fields of the selected widget, as a form. */
class InspectorPanel extends Panel {
  constructor(designer) {
    super();
    this.designer = designer;
    this.form = document.createElement('div');
    this.form.className = 'cr-designer-inspector';
    this.element.appendChild(this.form);
  }

  render(node) {
    const d = this.designer;
    const parent = parentOf(d.root, node);
    const title = document.createElement('h3');
    title.textContent = node === d.root ? `${node.class} (the root)` : node.class;
    const parts = [title];
    if (node === d.root) {
      const hint = document.createElement('div');
      hint.className = 'cr-designer-hint';
      hint.textContent = 'A program adds a copy with vp.loadComposite(name).';
      parts.push(hint);
    }
    for (const [group, fields] of fieldsFor(node, { isRoot: node === d.root, parent })) {
      const h = document.createElement('h4');
      h.textContent = group;
      parts.push(h);
      for (const field of fields) parts.push(this._row(node, field));
    }
    this.form.replaceChildren(...parts);
  }

  _row(node, field) {
    const row = document.createElement('div');
    row.className = 'cr-designer-row';
    const label = document.createElement('label');
    label.textContent = field.label;
    label.title = field.label;
    let input;
    if (field.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(getField(node, field));
      input.addEventListener('change', () => this._commit(node, field, input.checked, input));
    } else {
      input = document.createElement(field.type === 'lines' ? 'textarea' : 'input');
      if (field.type === 'lines') input.rows = 4;
      else input.type = 'text';
      input.value = String(getField(node, field) ?? '');
      input.spellcheck = false;
      input.addEventListener('change', () => this._commit(node, field, input.value, input));
      if (field.type !== 'lines') {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      }
    }
    const id = `cr-designer-${Math.random().toString(36).slice(2)}`;
    input.id = id;
    label.htmlFor = id;
    input.dataset.field = field.label;
    row.append(label, input);
    return row;
  }

  _commit(node, field, value, input) {
    try {
      setField(node, field, value);
      this.designer.changed();
    } catch (err) {
      this.designer.status(err.message, 'error');
      if (input.type === 'checkbox') input.checked = Boolean(getField(node, field));
      else input.value = String(getField(node, field) ?? '');
    }
  }
}

// -------------------------------------------------------------- the window

let opened = 0;

export class DesignerWindow extends Window {
  /** @param {{ root?: object, name?: string }} options - a composite to start with */
  constructor({ root = null, name = '', ...options } = {}) {
    installStyle();
    const offset = (opened++ % 6) * 24;
    super({ title: 'Designer', x: 90 + offset, y: 60 + offset, width: 980, height: 560, minWidth: 600, minHeight: 320, ...options });
    this.element.classList.add('cr-designer-window');
    this.root = root ?? newNode('VPanel');
    this.selected = this.root;
    this.dirty = false;
    this.names = [];                 // saved composites, for the Open menu
    this.codeWindow = null;          // the open Code window, which follows the design
    this.viewport = null;

    this.outlineList = new ListPanel();
    this.paletteList = new ListPanel({ items: PALETTE.map((c) => ({ label: c, value: c })) });
    this.preview = new PreviewPanel(this);
    this.inspector = new InspectorPanel(this);
    const left = new VSplitPanel({ first: titled('Outline', this.outlineList), second: titled('Palette (double-click to add)', this.paletteList), position: 0.6 });
    const right = new HSplitPanel({ first: titled('Preview', this.preview), second: titled('Properties', this.inspector), position: 0.62 });
    this.content = new HSplitPanel({ first: left, second: right, position: 0.24 });

    this.outlineList.element.addEventListener('select', (e) => {
      if (e.target === this.outlineList.element && e.detail.item) this.select(e.detail.item.value);
    });
    this.paletteList.element.addEventListener('dblclick', () => this.addFromPalette());

    const bar = this.buttonBar;
    const newMenu = new Menu('New');
    for (const cls of PALETTE) newMenu.addItem(cls, () => this.newComposite(cls));
    bar.add(newMenu);
    this.openMenu = new Menu('Open');
    this.openMenu.itemsProvider = () => [
      ...(this.names.length ? this.names.map((n) => ({ label: n, action: () => this.openComposite(n) })) : [{ label: '(no composites saved)', action: () => {}, enabled: () => false }]),
      { separator: true },
      { label: 'Refresh list', action: () => this.refreshNames() },
    ];
    bar.add(this.openMenu);
    this.nameField = bar.add(new NameField('composite name'));
    this.nameField.value = name;
    bar.addButton('Save', () => this.save());
    bar.add(new Spacer(0)).fixedWidth = 8;
    bar.addButton('Add', () => this.addFromPalette());
    bar.addButton('Delete', () => this.deleteSelected());
    bar.addButton('Up', () => this.move(-1));
    bar.addButton('Down', () => this.move(1));
    this.testButton = bar.addButton('Test', () => this.toggleTest());
    bar.addButton('Code', () => this.showCode());
    bar.add(new Spacer());
    this.statusLabel = bar.add(new Label(''));

    this.nameField.element.addEventListener('input', () => this._title());
    this.element.addEventListener('close', (e) => {
      if (e.target !== this.element) return;
      if (this.dirty && !confirm(`Discard unsaved changes to "${this.name || 'the new composite'}"?`)) { e.preventDefault(); return; }
      this.codeWindow?.close();
    });
    this._title();
    this.refreshNames();
  }

  get name() { return this.nameField.value; }

  open(viewport) {
    super.open(viewport);
    this.viewport = viewport;
    this.refresh();
    return this;
  }

  /** Opens the window with the program that builds the design (or brings it to the front). */
  showCode() {
    if (!this.codeWindow?.parent) this.codeWindow = new DesignerCodeWindow({ designer: this });
    this.codeWindow.refresh();
    this.codeWindow.open(this.viewport);   // also restores a minimized one
  }

  // ---- state

  _title() { this.title = `Designer - ${this.name || 'untitled'}${this.dirty ? ' *' : ''}`; }

  status(text, tone) {
    this.statusLabel.text = text;
    this.statusLabel.tone = tone;
    this.statusLabel.element.title = text;
    this.buttonBar.layout();
  }

  /** Whether node is placed freely (the root, or a child of a Panel), so it can be dragged. */
  isFree(node) {
    const parent = parentOf(this.root, node);
    return !parent || parent.class === 'Panel';
  }

  /** Shows the tree again after an edit: outline, preview and properties. */
  refresh() {
    const rows = outline(this.root);
    if (!rows.some((r) => r.node === this.selected)) this.selected = this.root;
    this.outlineList.items = rows.map((r) => ({ label: r.text, value: r.node }));
    this.outlineList.select(rows.findIndex((r) => r.node === this.selected));
    this.preview.render();
    this.inspector.render(this.selected);
    this.codeWindow?.refresh();
  }

  changed() {
    this.dirty = true;
    this._title();
    this.refresh();
  }

  select(node) {
    if (node === this.selected) return;
    this.selected = node;
    this.outlineList.select(outline(this.root).findIndex((r) => r.node === node));
    this.inspector.render(node);
    this.preview.reveal(node);
  }

  /** Records a drag in the preview: new left/top, or width/height. */
  setPlace(node, place) {
    const fields = fieldsFor(node, { isRoot: node === this.root, parent: parentOf(this.root, node) })
      .flatMap(([, fs]) => fs);
    for (const [key, value] of Object.entries(place)) {
      const field = fields.find((f) => f.key === key && f.type === 'number');
      if (field) setField(node, field, String(value));
    }
    this.changed();
  }

  // ---- editing

  /** Adds a widget of the palette's selected class to the selection, or beside it. */
  addFromPalette(cls = this.paletteList.selectedItem?.value) {
    if (!cls) { this.status('Pick a class in the Palette first', 'error'); return; }
    const node = newNode(cls);
    let parent = this.selected;
    let after = null;
    if (!canAdd(parent)) {
      after = parent;
      parent = parentOf(this.root, parent);
    }
    if (!parent) { this.status(`A ${this.selected.class} cannot hold other widgets`, 'error'); return; }
    const problem = addChild(parent, node);
    if (problem) { this.status(problem, 'error'); return; }
    // Beside the selection when that was not a container: move it up next to it.
    if (after && parent.children) {
      const list = parent.children;
      list.splice(list.indexOf(node), 1);
      list.splice(list.indexOf(after) + 1, 0, node);
    }
    this.selected = node;
    this.status(`Added a ${cls}`);
    this.changed();
  }

  deleteSelected() {
    const node = this.selected;
    const parent = parentOf(this.root, node);
    const problem = removeNode(this.root, node);
    if (problem) { this.status(problem, 'error'); return; }
    this.selected = parent;
    this.status(`Deleted a ${node.class}`);
    this.changed();
  }

  move(delta) {
    const problem = moveNode(this.root, this.selected, delta);
    if (problem) { this.status(`Cannot move it: ${problem}`, 'error'); return; }
    this.changed();
  }

  toggleTest() {
    this.preview.testing = !this.preview.testing;
    this.testButton.label = this.preview.testing ? 'Design' : 'Test';
    this.status(this.preview.testing ? 'Testing: the preview works as it will in a program' : '');
    this.preview.render();
  }

  // ---- files

  _discardOk() {
    return !this.dirty || confirm(`Discard unsaved changes to "${this.name || 'the new composite'}"?`);
  }

  newComposite(cls) {
    if (!this._discardOk()) return;
    this.root = newNode(cls);
    this.selected = this.root;
    this.nameField.value = '';
    this.dirty = false;
    this._title();
    this.status(`New composite: a ${cls}`);
    this.refresh();
  }

  async openComposite(name) {
    if (!this._discardOk()) return;
    this.status(`Opening ${name}...`);
    try {
      const doc = await fetchDoc(name, 'composite');
      this.root = doc.root;
      this.selected = this.root;
      this.nameField.value = name;
      this.dirty = false;
      this._title();
      this.refresh();
      this.status(`Opened ${name}`);
    } catch (err) {
      this.status(err.message, 'error');
    }
  }

  async save() {
    const name = this.name;
    if (!name) { this.status('Give the composite a name first', 'error'); this.nameField.element.focus(); return; }
    this.status(`Saving ${name}...`);
    try {
      await storeDoc(name, toDoc(this.root));
      this.dirty = false;
      this._title();
      this.status(`Saved ${name}`);
      if (!this.names.includes(name)) this.names = [...this.names, name].sort((a, b) => a.localeCompare(b));
    } catch (err) {
      this.status(err.message, 'error');
    }
  }

  async refreshNames() {
    try {
      this.names = await listDocs('composite');
    } catch (err) {
      this.status(err.message, 'error');
    }
  }
}

