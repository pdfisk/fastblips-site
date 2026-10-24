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
// dragged to move it; elsewhere (in a row, column, tab or split) dragging it
// moves it to the place where it is dropped, in the same container or in
// another. Every widget is resized by its corner grip. A class dragged from
// the Palette and dropped on the Preview is added there. Add, Delete, Up and
// Down still arrange the selection without the mouse. The Outline takes drags
// too: a row dropped on another becomes its child, or goes just before or
// after it. Cut, Copy and Paste (the Edit menu, Ctrl+X, Ctrl+C and Ctrl+V) work
// on a widget with everything in it, between designers too. Test switches the
// Preview from designing to using it (buttons click, lists scroll). Code
// shows the Basic or Python program that builds the design
// (designer-code-window.js). Size limits the Preview to the screen of a
// phone or tablet, to see how the design fits it.
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
  PALETTE, newNode, addChild, insertChild, removeNode, moveNode, moveNodeTo, parentOf, canAdd, outline,
  fieldsFor, getField, setField, toDoc, childrenOf, isWithin, pasteNode, cloneNode,
} from '../designer-model.js';
import { DesignerCodeWindow } from './designer-code-window.js';

const STYLE = `
.cr-designer-caption{font:bold var(--cr-font-size-small) var(--cr-font-ui);color:var(--cr-text-muted);
  background:var(--cr-buttonbar-bg);border-bottom:1px solid var(--cr-buttonbar-border);padding:0 6px}
.cr-designer-preview{background:var(--cr-output-bg);overflow:hidden;
  background-image:radial-gradient(var(--cr-divider) 1px,transparent 1px);background-size:10px 10px}
.cr-designer-preview.cr-designer-sized{overflow:auto}
.cr-designer-device{box-shadow:0 0 0 1px var(--cr-accent),0 2px 12px rgba(0,0,0,.35);overflow:hidden;
  background:var(--cr-window-bg)}
.cr-designer-select{position:absolute;pointer-events:none;outline:2px solid var(--cr-accent);
  outline-offset:-1px;z-index:99999;box-sizing:border-box}
.cr-designer-grip{position:absolute;right:-5px;bottom:-5px;width:9px;height:9px;background:var(--cr-accent);
  pointer-events:auto;cursor:nwse-resize}
.cr-designer-drop{position:absolute;pointer-events:none;z-index:99998;box-sizing:border-box;
  background:var(--cr-accent);opacity:.85}
.cr-designer-drop.cr-designer-into{background:transparent;outline:2px dashed var(--cr-accent);outline-offset:-2px;opacity:1}
.cr-designer-ghost{position:fixed;pointer-events:none;z-index:2147483647;padding:2px 8px;
  background:var(--cr-accent);color:#fff;font:var(--cr-font-size) var(--cr-font-ui);border-radius:3px;opacity:.9}
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

/** The screens the Preview can be limited to, as { label, width, height } (null: the whole Preview). */
export const PREVIEW_SIZES = [
  { label: 'Fit the window', size: null },
  { label: 'Phone, portrait (360 x 640)', size: { width: 360, height: 640 } },
  { label: 'Phone, landscape (640 x 360)', size: { width: 640, height: 360 } },
  { label: 'Small phone (320 x 568)', size: { width: 320, height: 568 } },
  { label: 'Large phone (412 x 915)', size: { width: 412, height: 915 } },
  { label: 'Tablet, portrait (768 x 1024)', size: { width: 768, height: 1024 } },
  { label: 'Tablet, landscape (1024 x 768)', size: { width: 1024, height: 768 } },
];

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

// ------------------------------------------------------------ dragging

/** Draws marker over target.rect (viewport coordinates) inside container, or hides it for null. */
function paintMarker(marker, target, container, scrolls = false) {
  if (!target) { marker.style.display = 'none'; return; }
  const p = container.getBoundingClientRect();
  marker.classList.toggle('cr-designer-into', Boolean(target.into));
  Object.assign(marker.style, {
    display: 'block', left: `${target.rect.left - p.left + (scrolls ? container.scrollLeft : 0)}px`,
    top: `${target.rect.top - p.top + (scrolls ? container.scrollTop : 0)}px`,
    width: `${target.rect.width}px`, height: `${target.rect.height}px`,
  });
}

/**
 * Follows the pointer from a press until it is let go, as a drag: a ghost
 * with label follows it, resolve(x, y) says where it would land (a target, or
 * null for nowhere), paint(target) shows that, and letting go on a target
 * calls drop(target); letting go anywhere else calls miss(). Escape cancels.
 * A press that never moves more than a few pixels is no drag.
 */
function trackDrag(down, { label, resolve, paint, drop, miss, end }) {
  const ghost = document.createElement('div');
  ghost.className = 'cr-designer-ghost';
  ghost.textContent = label;
  let started = false;
  const saved = document.body.style.userSelect;
  const finish = () => {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', finish, true);
    document.removeEventListener('keydown', onKey, true);
    document.body.style.userSelect = saved;
    ghost.remove();
    paint(null);
    end?.();
  };
  const onMove = (e) => {
    if (!started) {
      if (Math.abs(e.clientX - down.clientX) + Math.abs(e.clientY - down.clientY) < 4) return;
      started = true;
      document.body.style.userSelect = 'none';
      document.body.appendChild(ghost);
    }
    ghost.style.left = `${e.clientX + 12}px`;
    ghost.style.top = `${e.clientY + 12}px`;
    paint(resolve(e.clientX, e.clientY));
  };
  const onUp = (e) => {
    const target = started ? resolve(e.clientX, e.clientY) : null;
    const wasStarted = started;
    finish();
    if (!wasStarted) return;
    if (target) drop(target); else miss();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } };
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', finish, true);
  document.addEventListener('keydown', onKey, true);
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
    this.size = null;             // { width, height } of the screen shown, or null to fill the Preview
    this.nodeOf = new Map();      // widget -> node
    this.widgetOf = new Map();    // node -> widget

    this.selectBox = document.createElement('div');
    this.selectBox.className = 'cr-designer-select';
    this.grip = document.createElement('div');
    this.grip.className = 'cr-designer-grip';
    this.grip.title = 'Drag to resize';
    this.selectBox.appendChild(this.grip);
    this.element.appendChild(this.selectBox);
    this.marker = document.createElement('div');   // where a drag would drop
    this.marker.className = 'cr-designer-drop';
    this.marker.style.display = 'none';
    this.element.appendChild(this.marker);

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
    const s = this.size;
    this.element.classList.toggle('cr-designer-sized', Boolean(s));
    this.layer.element.classList.toggle('cr-designer-device', Boolean(s));
    if (s) {
      // The screen sits in the middle of the Preview, or at its top left (to scroll) if it does not fit.
      const margin = 12;
      this.layer.setBounds(Math.max(margin, Math.round((width - s.width) / 2)),
        Math.max(margin, Math.round((height - s.height) / 2)), s.width, s.height);
    } else {
      this.layer.setBounds(0, 0, width, height);
    }
    super.layout();
    this.drawSelection();
  }

  /** Limits the Preview to a screen of this size, or (null) lets it fill the Preview again. */
  setSize(size) {
    this.size = size;
    this.layout();
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
      display: 'block', left: `${r.left - p.left + this.element.scrollLeft}px`, top: `${r.top - p.top + this.element.scrollTop}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    });
    this.grip.style.display = 'block';
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
    this.designer.outlineList.list.focus({ preventScroll: true });   // so Ctrl+X, C and V reach the designer
    if (!this.designer.isFree(node)) {
      if (resizing) this._resizeInFlow(e, node);
      else this.startDrag(e, { node, label: node.class });
      return;
    }
    this._drag(e, node, resizing);
  }

  /**
   * Resizes a widget that sits in a row, column, tab or split: its width and
   * height are fields it may be given (a row or column otherwise sizes it
   * itself), and the Preview is built again as they change.
   */
  _resizeInFlow(down, node) {
    const widget = this.widgetOf.get(node);
    if (!widget) return;
    const box = widget.element.getBoundingClientRect();
    const grip = this.grip;
    grip.setPointerCapture?.(down.pointerId);
    let moved = false;
    const onMove = (e) => {
      const width = Math.max(8, Math.round(box.width + e.clientX - down.clientX));
      const height = Math.max(8, Math.round(box.height + e.clientY - down.clientY));
      if (!moved && Math.abs(width - box.width) + Math.abs(height - box.height) < 3) return;
      moved = true;
      this.designer.applyPlace(node, { width, height });
      this.render();
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      if (moved) this.designer.changed();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  // ---- drag and drop: a Palette class or a widget, dropped where it should go

  /** Starts dragging a Palette class (cls) or an existing widget (node); see DesignerWindow.dragFrom. */
  startDrag(down, spec) { this.designer.dragFrom(down, spec); }

  /**
   * Where a widget dropped at the pointer would go: { parent, index?, place?, rect } -
   * the container, the position in it (lists), the left/top inside a Panel
   * (free placement), and the box to mark - or null. Nothing may go inside
   * the widget being moved.
   */
  _dropTarget(x, y, moving) {
    if (this.testing) return null;
    const el = document.elementFromPoint(x, y);
    if (!el || !this.element.contains(el)) return null;
    const d = this.designer;
    let hit = this._nodeAt(el);
    while (hit && moving && isWithin(hit, moving)) hit = parentOf(d.root, hit);
    if (!hit) return null;
    const rectOf = (n) => this.widgetOf.get(n)?.element.getBoundingClientRect() ?? null;
    const horizontal = (n) => n.class === 'HPanel' || n.class === 'ButtonBar';

    let parent = hit;
    let before = null;   // the sibling to go before, or null for the end (or the first slot)
    let anchor = null;   // the sibling the pointer is over, if hit is not a container
    if (!canAdd(hit)) {
      parent = parentOf(d.root, hit);
      if (!parent) return null;
      anchor = hit;
    }
    if (parent.class === 'Panel') {
      const box = rectOf(parent);
      if (!box) return null;
      const here = { x: x - box.left, y: y - box.top };
      return { parent, place: { left: Math.max(0, Math.round(here.x)), top: Math.max(0, Math.round(here.y)) },
        rect: { left: x, top: y, width: 8, height: 8 }, into: true, region: 'preview' };
    }
    const listy = ['HPanel', 'VPanel', 'ButtonBar'].includes(parent.class);
    if (!listy) {
      if (!canAdd(parent)) return null;
      const box = rectOf(parent);
      return box ? { parent, rect: box, into: true, region: 'preview' } : null;
    }
    const kids = childrenOf(parent).filter((k) => k !== moving);
    const after = (kid) => {
      const r = rectOf(kid);
      if (!r) return false;
      return horizontal(parent) ? x >= r.left + r.width / 2 : y >= r.top + r.height / 2;
    };
    let at = kids.length;
    if (anchor) {
      const i = kids.indexOf(anchor);
      at = i < 0 ? kids.length : i + (after(anchor) ? 1 : 0);
    } else {
      at = kids.findIndex((k) => !after(k));
      if (at < 0) at = kids.length;
    }
    before = kids[at] ?? null;
    // The index counts the parent's own list, which still holds the widget being moved.
    const own = childrenOf(parent);
    const index = before ? own.indexOf(before) : own.length;
    let rect;
    if (before) rect = rectOf(before);
    else if (kids.length) rect = rectOf(kids[kids.length - 1]);
    else rect = rectOf(parent);
    if (!rect) return null;
    const line = 3;
    if (!kids.length) return { parent, index, rect, into: true, region: 'preview' };
    const edge = before
      ? (horizontal(parent) ? { left: rect.left - line / 2, top: rect.top, width: line, height: rect.height }
        : { left: rect.left, top: rect.top - line / 2, width: rect.width, height: line })
      : (horizontal(parent) ? { left: rect.right - line / 2, top: rect.top, width: line, height: rect.height }
        : { left: rect.left, top: rect.bottom - line / 2, width: rect.width, height: line });
    return { parent, index, rect: edge, region: 'preview' };
  }

  /** Marks where a drag would drop (a target from _dropTarget), or (null) hides the mark. */
  showMarker(target) { paintMarker(this.marker, target, this.element, true); }

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
let clipboard = null;   // the node last cut or copied: shared by every designer on the page

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
    this.previewSize = PREVIEW_SIZES[0];   // the screen the Preview shows (Size menu)

    this.outlineList = new ListPanel();
    this.paletteList = new ListPanel({ items: PALETTE.map((c) => ({ label: c, value: c })) });
    this.preview = new PreviewPanel(this);
    this.inspector = new InspectorPanel(this);
    const left = new VSplitPanel({ first: titled('Outline', this.outlineList), second: titled('Palette (double-click, or drag to the Preview)', this.paletteList), position: 0.6 });
    const right = new HSplitPanel({ first: titled('Preview', this.preview), second: titled('Properties', this.inspector), position: 0.62 });
    this.content = new HSplitPanel({ first: left, second: right, position: 0.24 });

    this.outlineList.element.addEventListener('select', (e) => {
      if (e.target === this.outlineList.element && e.detail.item) this.select(e.detail.item.value);
    });
    this.outlineMarker = document.createElement('div');   // where a drag in the Outline would drop
    this.outlineMarker.className = 'cr-designer-drop';
    this.outlineMarker.style.display = 'none';
    this.outlineList.element.appendChild(this.outlineMarker);
    // Dragging a row of the Outline moves that widget (and what is in it) to where it is dropped.
    this.outlineList.element.addEventListener('pointerdown', (e) => {
      const row = e.button === 0 ? e.target.closest('li[data-index]') : null;
      const node = row && outline(this.root)[Number(row.dataset.index)]?.node;
      if (node && node !== this.root) this.dragFrom(e, { node, label: node.class });
    });
    this.paletteList.element.addEventListener('dblclick', () => this.addFromPalette());
    // Dragging a class from the Palette to the Preview adds a widget where it is dropped.
    this.paletteList.element.addEventListener('pointerdown', (e) => {
      const row = e.button === 0 ? e.target.closest('li[data-index]') : null;
      const cls = row && this.paletteList.items[Number(row.dataset.index)]?.value;
      if (cls) this.dragFrom(e, { cls, label: `+ ${cls}` });
    });

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
    const editMenu = new Menu('Edit');
    editMenu.addItem('Cut  (Ctrl+X)', () => this.cut(), { enabled: () => this.selected !== this.root });
    editMenu.addItem('Copy  (Ctrl+C)', () => this.copy());
    editMenu.addItem('Paste  (Ctrl+V)', () => this.paste(), { enabled: () => clipboard !== null });
    bar.add(editMenu);
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
    this.sizeMenu = new Menu('Size');
    for (const choice of PREVIEW_SIZES) {
      this.sizeMenu.addItem(choice.label, () => this.setPreviewSize(choice), { checked: () => this.previewSize === choice });
    }
    bar.add(this.sizeMenu);
    bar.add(new Spacer());
    this.statusLabel = bar.add(new Label(''));

    this.nameField.element.addEventListener('input', () => this._title());
    // Ctrl+X, C and V on the widgets, unless a text field has the focus (it cuts, copies and pastes its own text).
    this.element.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || this.preview.testing) return;
      const t = e.target;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const action = { x: () => this.cut(), c: () => this.copy(), v: () => this.paste() }[e.key.toLowerCase()];
      if (!action) return;
      e.preventDefault();
      action();
    });
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

  /** Sets the left/top or width/height fields a node has, without showing the change. */
  applyPlace(node, place) {
    const fields = fieldsFor(node, { isRoot: node === this.root, parent: parentOf(this.root, node) })
      .flatMap(([, fs]) => fs);
    for (const [key, value] of Object.entries(place)) {
      const field = fields.find((f) => f.key === key && f.type === 'number');
      if (field) setField(node, field, String(value));
    }
  }

  /** Records a drag in the preview: new left/top, or width/height. */
  setPlace(node, place) {
    this.applyPlace(node, place);
    this.changed();
  }

  /**
   * Adds a new widget of class cls, or moves the widget node, to a drop
   * target found by the Preview ({ parent, index?, place? }), and selects it.
   */
  drop({ cls = null, node = null }, { parent, index, place }) {
    let moved = node;
    let problem;
    if (cls) {
      moved = newNode(cls);
      problem = insertChild(parent, moved, index);
    } else {
      problem = moveNodeTo(this.root, node, parent, index);
    }
    if (problem) { this.status(problem, 'error'); return false; }
    if (place) this.applyPlace(moved, place);
    this.selected = moved;
    this.status(cls ? `Added a ${cls}` : `Moved the ${moved.class}`);
    this.changed();
    return true;
  }

  // ---- cut, copy and paste

  /** Copies the selected widget, and everything in it, to the clipboard. */
  copy() {
    clipboard = cloneNode(this.selected);
    try { globalThis.navigator?.clipboard?.writeText?.(JSON.stringify(clipboard, null, 2))?.catch?.(() => {}); } catch { /* the page's own clipboard is enough */ }
    this.status(`Copied the ${this.selected.class}`);
  }

  /** Copies the selected widget and deletes it. */
  cut() {
    const node = this.selected;
    if (node === this.root) { this.status('The root cannot be cut: start a New composite instead', 'error'); return; }
    this.copy();
    this.deleteSelected();
    this.status(`Cut the ${node.class}`);
  }

  /** Adds a copy of the clipboard's widget inside the selection, or after it; selects the copy. */
  paste() {
    if (!clipboard) { this.status('Nothing to paste: copy or cut a widget first', 'error'); return; }
    const { node, problem } = pasteNode(this.root, this.selected, clipboard);
    if (problem) { this.status(problem, 'error'); return; }
    this.selected = node;
    this.status(`Pasted a ${node.class}`);
    this.changed();
  }

  // ---- drag and drop

  /**
   * Drags a new widget of class cls (from the Palette) or the existing widget
   * node (from the Preview or the Outline) to where it is let go: in the
   * Preview or in the Outline. A marker shows the place; Escape cancels.
   */
  dragFrom(down, { cls = null, node = null, label }) {
    const grip = this.preview.grip;
    grip.style.pointerEvents = 'none';   // so the widget under the grip is what the pointer finds
    trackDrag(down, {
      label,
      resolve: (x, y) => this.preview._dropTarget(x, y, node) ?? this._outlineTarget(x, y, node),
      paint: (t) => {
        this.preview.showMarker(t?.region === 'preview' ? t : null);
        paintMarker(this.outlineMarker, t?.region === 'outline' ? t : null, this.outlineList.element);
      },
      drop: (t) => this.drop({ cls, node }, t),
      miss: () => this.status('Drop it on the Preview or the Outline, on a place that can hold it', 'error'),
      end: () => { grip.style.pointerEvents = ''; },
    });
  }

  /**
   * Where a widget dropped on the Outline at the pointer would go: on the
   * upper quarter of a row, before that widget; on the lower quarter, after
   * it; between, inside it if it can hold more. Null if not over a row, or the
   * row is the widget being moved or something in it.
   */
  _outlineTarget(x, y, moving) {
    const li = document.elementFromPoint(x, y)?.closest?.('li[data-index]');
    if (!li || !this.outlineList.list.contains(li)) return null;
    const node = outline(this.root)[Number(li.dataset.index)]?.node;
    if (!node || (moving && isWithin(node, moving))) return null;
    const r = li.getBoundingClientRect();
    const f = (y - r.top) / Math.max(1, r.height);
    let mode = f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'into';
    if (mode === 'into' && !canAdd(node)) mode = f < 0.5 ? 'before' : 'after';
    if (mode === 'into') return { parent: node, rect: r, into: true, region: 'outline' };
    const parent = parentOf(this.root, node);
    if (!parent) return null;
    let index;
    if (['Panel', 'HPanel', 'VPanel', 'ButtonBar'].includes(parent.class)) {
      index = childrenOf(parent).indexOf(node) + (mode === 'after' ? 1 : 0);
    } else if (!canAdd(parent)) {
      return null;
    }
    const line = 3;
    const rect = { left: r.left, width: r.width, height: line, top: mode === 'before' ? r.top - line / 2 : r.bottom - line / 2 };
    return { parent, index, rect, region: 'outline' };
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

  /** Shows the design on the screen of a phone or tablet (one of PREVIEW_SIZES), or on all of the Preview. */
  setPreviewSize(choice) {
    this.previewSize = choice;
    this.preview.setSize(choice.size);
    this.status(choice.size ? `Preview: ${choice.size.width} x ${choice.size.height}` : 'Preview fits the window');
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

