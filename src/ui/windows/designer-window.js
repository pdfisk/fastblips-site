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
// Down (the Arrange menu) still arrange the selection without the mouse. The
// Outline takes drags too: a row dropped on another becomes its child, or goes
// just before or after it. Cut, Copy and Paste (the Edit menu, Ctrl+X, Ctrl+C and Ctrl+V) work
// on a widget with everything in it, between designers too. Test switches the
// Preview from designing to using it (buttons click, lists scroll). Code
// shows the Python program that builds the design
// (designer-code-window.js). Size limits the Preview to the screen of a
// phone or tablet, to see how the design fits it, and can put a phone's
// screen beside it.
//
// Run runs the design's program with the Preview as its screen, so that its
// handlers answer the widgets and what they animate can be tried. The Script
// menu links the design to one of the user's scripts: its functions are
// offered for the events, Run runs it with the design, and Update writes the
// design's layout into it. Every edit can be undone (Ctrl+Z, Ctrl+Y).
// Shift+click selects several widgets, which Arrange lines up; a dragged
// widget snaps to those beside it; the arrows nudge, a double click edits a
// text in place, a right click opens a menu, and New offers starter designs.
// See docs/widgets.txt, "GUI designer".
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
import { Drawer } from '../widgets/drawer.js';
import {
  FreeLayer, ProgramWidgetHost, fetchDoc, storeDoc, listDocs,
} from '../program-widgets.js';
import {
  PALETTE, newNode, addChild, insertChild, removeNode, moveNode, moveNodeTo, parentOf, canAdd, outline,
  fieldsFor, getField, setField, toDoc, childrenOf, isWithin, pasteNode, cloneNode, isFreeParent, isHorizontal, isList,
  paletteRows, History, sharedFreeParent, ALIGNMENTS, alignNodes, snapBox, wrapNode, textFieldOf, sampleItems,
  TEMPLATES, makeIdsUnique,
} from '../designer-model.js';
import { generateCode, linkCode, functionsIn, handlersOf, missingHandlers } from '../designer-codegen.js';
import { DesignerCodeWindow } from './designer-code-window.js';
import { PythonConsoleWindow } from './python-console-window.js';
import { scheduler } from '../runtime.js';
import { scriptStore } from '../projects.js';
import { spaceName } from '../db-client.js';

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
.cr-designer-preview:focus{outline:none}
.cr-designer-preview .cr-app-widgets{touch-action:none}
.cr-designer-select.cr-designer-also{outline-style:dashed}
.cr-designer-guide{position:absolute;pointer-events:none;z-index:99997;background:#e0457b;display:none}
.cr-designer-edit{position:absolute;z-index:100000;box-sizing:border-box;font:var(--cr-font-size) var(--cr-font-ui);
  background:var(--cr-input-bg);color:var(--cr-text);border:2px solid var(--cr-accent);padding:0 4px}
.cr-designer-output{position:absolute;left:0;right:0;bottom:0;max-height:35%;overflow:auto;z-index:99996;margin:0;
  padding:4px 8px;box-sizing:border-box;white-space:pre-wrap;font:var(--cr-font-size-small) var(--cr-font-code);
  background:var(--cr-window-bg);color:var(--cr-text);border-top:1px solid var(--cr-buttonbar-border);display:none}
.cr-designer-context{position:fixed;z-index:2147483646;min-width:170px;margin:0;padding:4px 0;list-style:none;
  background:var(--cr-window-bg);color:var(--cr-text);border:1px solid var(--cr-buttonbar-border);
  box-shadow:0 4px 16px rgba(0,0,0,.35);font:var(--cr-font-size) var(--cr-font-ui)}
.cr-designer-context li{padding:3px 14px;cursor:default;white-space:nowrap}
.cr-designer-context li:hover{background:var(--cr-accent);color:#fff}
.cr-designer-context li.cr-designer-off{color:var(--cr-text-faint);pointer-events:none}
.cr-designer-context li.cr-designer-line{height:1px;padding:0;margin:4px 0;background:var(--cr-buttonbar-border);pointer-events:none}
.cr-designer-missing input{border-color:#d9822b}
.cr-designer-missing label::after{content:' (new)';color:#d9822b}
@media (pointer:coarse){
  .cr-designer-grip{right:-12px;bottom:-12px;width:24px;height:24px;border-radius:12px}
  .cr-designer-context li{padding:9px 16px}
}
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
    this.fixedWidth = 130;
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
    // A second copy of the design, on a phone's screen beside the first (Size menu): looked at, not edited.
    this.mirrorLayer = this.add(new FreeLayer());
    this.mirrorLayer.visible = false;
    this.mirrorHost = new ProgramWidgetHost(this.mirrorLayer);
    this.mirror = null;           // { width, height } of that second screen, or null for none
    this.testing = false;         // the widgets work (Test, and Run)
    this.running = false;         // a program has built what the Preview shows (Run)
    this.process = null;          // that program
    this.element.tabIndex = 0;    // so the arrow keys and Delete reach the designer from here
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
    this.alsoBoxes = [];          // the boxes round the other widgets of a selection of several
    this.guides = { x: document.createElement('div'), y: document.createElement('div') };   // the lines a drag snaps to
    for (const guide of Object.values(this.guides)) {
      guide.className = 'cr-designer-guide';
      this.element.appendChild(guide);
    }
    this.output = document.createElement('pre');   // what a program run here prints, and its errors
    this.output.className = 'cr-designer-output';
    this.element.appendChild(this.output);

    // In design mode a press selects (and may drag); nothing reaches the widgets.
    const own = (e) => Boolean(e.target.closest?.('.cr-designer-edit'));   // the box a text is edited in works as usual
    const swallow = (e) => { if (!this.testing && !own(e)) { e.preventDefault(); e.stopPropagation(); } };
    this.element.addEventListener('pointerdown', (e) => { if (!own(e)) this._press(e); }, true);
    for (const type of ['click', 'dblclick', 'mousedown', 'contextmenu']) this.element.addEventListener(type, swallow, true);
    // A double click edits the text on a widget where it is; a right click (or a long press) opens its menu.
    this.element.addEventListener('dblclick', (e) => {
      if (this.testing || own(e) || e.target === this.grip) return;
      const node = this._nodeAt(e.target);
      this.designer.select(node);
      this.editText(node);
    }, true);
    this.element.addEventListener('contextmenu', (e) => {
      if (this.testing || own(e)) return;
      const node = this._nodeAt(e.target);
      if (!this.designer.selection.includes(node)) this.designer.select(node);
      this.designer.showContextMenu(e.clientX, e.clientY);
    }, true);
  }

  // ---- Run: a program builds what the Preview shows

  /** What a program prints to: the strip at the foot of the Preview, shown once there is something in it. */
  get _console() {
    const show = () => { this.output.style.display = this.output.textContent ? 'block' : 'none'; this.output.scrollTop = this.output.scrollHeight; };
    const out = this.output;
    return {
      get text() { return out.textContent; },
      set text(value) { out.textContent = String(value ?? ''); show(); },
      append(value) { out.textContent += String(value ?? ''); show(); },
    };
  }

  /**
   * Runs source (BlipPy) with the Preview as its screen, in place of the
   * design: its widgets work, its handlers run. Returns { process,
   * errorCount } as PythonConsoleWindow.spawn does (no process: it did not load).
   */
  startRun(source, name) {
    this.stopRun();
    this.running = true;
    this.testing = true;
    this.host.clear();
    this.nodeOf.clear();
    this.widgetOf.clear();
    const output = this._console;
    output.text = '';
    const result = PythonConsoleWindow.spawn(source, {
      name, output, gui: this.host, filename: `${name}.py`,
      onExit: (p) => { if (p === this.process) this.designer.runExited(p); },
    });
    this.process = result.process;
    this.layout();
    if (result.process) scheduler.start();
    return result;
  }

  /** Stops the program run here, if any; the caller shows the design again (render). */
  stopRun() {
    const process = this.process;
    this.process = null;
    if (process && !process.finished) scheduler.kill(process.pid);
    this.running = false;
    this.output.textContent = '';
    this.output.style.display = 'none';
  }

  // ---- editing a text where it is

  /** Opens a box over node's widget to change the text on it: Enter keeps it, Escape does not. */
  editText(node) {
    const d = this.designer;
    const field = textFieldOf(node, { isRoot: node === d.root, parent: parentOf(d.root, node) });
    const widget = this.widgetOf.get(node);
    if (!field || !widget) { d.status(`A ${node.class} has no text to edit here: use Properties`, 'error'); return; }
    const r = widget.element.getBoundingClientRect();
    const p = this.element.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cr-designer-edit';
    input.spellcheck = false;
    input.setAttribute('aria-label', `${field.label} of the ${node.class}`);
    const before = String(getField(node, field) ?? '');
    input.value = before;
    Object.assign(input.style, {
      left: `${r.left - p.left + this.element.scrollLeft}px`, top: `${r.top - p.top + this.element.scrollTop}px`,
      width: `${Math.max(90, r.width)}px`, height: `${Math.max(24, Math.min(r.height, 32))}px`,
    });
    this.element.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      input.remove();
      this.element.focus({ preventScroll: true });
      if (!keep || input.value === before) return;
      try {
        setField(node, field, input.value);
        d.changed();
      } catch (err) {
        d.status(err.message, 'error');
      }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  /** Rebuilds the preview from the designer's tree. */
  render() {
    if (this.running) return;   // a program has the Preview: the design is shown again when it is stopped
    const { root } = this.designer;
    this.host.clear();
    this.nodeOf.clear();
    this.widgetOf.clear();
    this.error = null;
    const sample = this.designer.sampleData && !this.testing;
    /** Builds the design on a layer; onBuilt as ProgramWidgetHost.build's. */
    const build = (host, layer, onBuilt) => {
      const widget = host.build(root, (w, node) => {
        // A drawer opened to be designed stays open; under Test it times out as in a program.
        if (w instanceof Drawer) w.timeout = this.testing ? null : 0;
        // An empty list shows sample rows while it is designed (they are not part of the design).
        const rows = sample ? sampleItems(node) : null;
        if (rows && node.class === 'ListPanel') w.items = rows.map((label, i) => ({ label, value: `sample ${i}` }));
        else if (rows) for (const row of rows) w.addItem(row);
        onBuilt?.(w, node);
      });
      layer.add(widget);
      if (widget instanceof Window) {
        // Its own title-bar buttons would close or shrink it: design it instead.
        widget.element.querySelectorAll('.cr-window-tool').forEach((b) => { b.style.visibility = 'hidden'; });
        widget.bringToFront();
      }
    };
    try {
      build(this.host, this.layer, (w, node) => {
        this.nodeOf.set(w, node);
        this.widgetOf.set(node, w);
      });
    } catch (err) {
      this.error = err.message;
    }
    this.mirrorHost.clear();
    if (this.mirror) {
      try { build(this.mirrorHost, this.mirrorLayer); } catch { /* the first copy says what is wrong */ }
    }
    this.layout();
    this.reveal(this.designer.selected);
  }

  layout() {
    const { width, height } = this.bounds;
    const s = this.size;
    const m = this.mirror;
    const sized = Boolean(s || m);
    this.element.classList.toggle('cr-designer-sized', sized);
    this.layer.element.classList.toggle('cr-designer-device', sized);
    this.mirrorLayer.element.classList.toggle('cr-designer-device', Boolean(m));
    this.mirrorLayer.visible = Boolean(m);
    if (sized) {
      // The screen sits in the middle of the Preview, or at its top left (to scroll) if it does not fit;
      // a second screen stands to its right. Without a size of its own the first takes the room that is left.
      const margin = 12;
      const w = s ? s.width : Math.max(320, width - m.width - 3 * margin);
      const h = s ? s.height : Math.max(120, height - 2 * margin);
      const x = Math.max(margin, Math.round((width - w - (m ? m.width + margin : 0)) / 2));
      this.layer.setBounds(x, Math.max(margin, Math.round((height - h) / 2)), w, h);
      if (m) this.mirrorLayer.setBounds(x + w + margin, Math.max(margin, Math.round((height - m.height) / 2)), m.width, m.height);
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

  /** Shows a second copy of the design on a screen of this size beside the first, or (null) takes it away. */
  setMirror(size) {
    this.mirror = size;
    this.render();
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
    const p = this.element.getBoundingClientRect();
    if (this.testing || !widget || !widget.element.isConnected) { box.style.display = 'none'; this._drawOthers(p); return; }
    const r = widget.element.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { box.style.display = 'none'; this._drawOthers(p); return; }
    Object.assign(box.style, {
      display: 'block', left: `${r.left - p.left + this.element.scrollLeft}px`, top: `${r.top - p.top + this.element.scrollTop}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    });
    this.grip.style.display = 'block';
    this._drawOthers(p);
  }

  /** Boxes round the other widgets of a selection of several (dashed; the first has the solid one). */
  _drawOthers(p) {
    const others = this.testing ? [] : this.designer.others;
    while (this.alsoBoxes.length < others.length) {
      const el = document.createElement('div');
      el.className = 'cr-designer-select cr-designer-also';
      this.element.appendChild(el);
      this.alsoBoxes.push(el);
    }
    this.alsoBoxes.forEach((el, i) => {
      const widget = this.widgetOf.get(others[i]);
      if (!widget || !widget.element.isConnected) { el.style.display = 'none'; return; }
      const r = widget.element.getBoundingClientRect();
      Object.assign(el.style, {
        display: 'block', left: `${r.left - p.left + this.element.scrollLeft}px`, top: `${r.top - p.top + this.element.scrollTop}px`,
        width: `${r.width}px`, height: `${r.height}px`,
      });
    });
  }

  /** Shows the lines a dragged widget has snapped to (snapBox's guides, in parent's coordinates), or none. */
  _drawGuides(guides, parentWidget) {
    for (const guide of Object.values(this.guides)) guide.style.display = 'none';
    if (!guides?.length || !parentWidget) return;
    const b = parentWidget.element.getBoundingClientRect();
    const p = this.element.getBoundingClientRect();
    const left = b.left - p.left + this.element.scrollLeft;
    const top = b.top - p.top + this.element.scrollTop;
    for (const { axis, at } of guides) {
      Object.assign(this.guides[axis].style, axis === 'x'
        ? { display: 'block', left: `${left + at}px`, top: `${top}px`, width: '1px', height: `${b.height}px` }
        : { display: 'block', left: `${left}px`, top: `${top + at}px`, width: `${b.width}px`, height: '1px' });
    }
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
    this.element.focus({ preventScroll: true });   // so the keys (Ctrl+X, the arrows, Delete) reach the designer
    // Shift or Ctrl with a press adds the widget to the selection, or takes it out.
    if (!resizing && (e.shiftKey || e.ctrlKey || e.metaKey)) { this.designer.select(node, { toggle: true }); return; }
    if (!resizing) this.designer.select(node);
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
    const horizontal = isHorizontal;

    let parent = hit;
    let before = null;   // the sibling to go before, or null for the end (or the first slot)
    let anchor = null;   // the sibling the pointer is over, if hit is not a container
    if (!canAdd(hit)) {
      parent = parentOf(d.root, hit);
      if (!parent) return null;
      anchor = hit;
    }
    if (isFreeParent(parent)) {
      const box = rectOf(parent);
      if (!box) return null;
      const here = { x: x - box.left, y: y - box.top };
      return { parent, place: { left: Math.max(0, Math.round(here.x)), top: Math.max(0, Math.round(here.y)) },
        rect: { left: x, top: y, width: 8, height: 8 }, into: true, region: 'preview' };
    }
    const listy = isList(parent);
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
    // A widget being moved snaps to the edges and centres of the widgets beside it, and of the
    // container they are in; lines show what it has snapped to. Alt moves it freely.
    const parent = parentOf(this.designer.root, node);
    const parentWidget = parent ? this.widgetOf.get(parent) : null;
    const near = parentWidget
      ? [{ x: 0, y: 0, width: parentWidget.bounds.width, height: parentWidget.bounds.height },
        ...childrenOf(parent).filter((n) => n !== node).map((n) => this.widgetOf.get(n)?.bounds).filter(Boolean)]
      : [];
    let moved = false;
    const onMove = (e) => {
      const dx = Math.round(e.clientX - down.clientX);
      const dy = Math.round(e.clientY - down.clientY);
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      const box = resizing
        ? [start[0], start[1], Math.max(8, start[2] + dx), Math.max(8, start[3] + dy)]
        : [start[0] + dx, start[1] + dy, start[2], start[3]];
      if (!resizing && near.length && !e.altKey) {
        const snap = snapBox({ x: box[0], y: box[1], width: box[2], height: box[3] }, near);
        box[0] = snap.x;
        box[1] = snap.y;
        this._drawGuides(snap.guides, parentWidget);
      } else {
        this._drawGuides(null);
      }
      widget.setBounds(...box);
      widget.layout();
      this.drawSelection();
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      this._drawGuides(null);
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
    const note = (text) => {
      const hint = document.createElement('div');
      hint.className = 'cr-designer-hint';
      hint.textContent = text;
      parts.push(hint);
    };
    if (d.others.length) note(`${d.others.length + 1} widgets are selected: these are the properties of the first. Arrange lines them up.`);
    // The functions an event can name: those of the linked script, and the handlers the design already uses.
    this.functions = d.script ? functionsIn(d.script.content) : [];
    let used = [];
    try { used = handlersOf(d.root).map((h) => h.name); } catch { /* a design that cannot be generated names none */ }
    this.choices = [...new Set([...this.functions, ...used])];
    for (const [group, fields] of fieldsFor(node, { isRoot: node === d.root, parent })) {
      const h = document.createElement('h4');
      h.textContent = group;
      parts.push(h);
      if (fields.some((f) => f.type === 'event')) {
        note(d.script
          ? `Pick a function of "${d.script.name}", or type a new name: it gets a stub when the script is updated.`
          : 'Type a handler\'s name. Link a script (Script menu) to pick from the functions it already has.');
      }
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
    if (field.type === 'event') {
      // The functions to pick from; a name the linked script does not define yet is marked as new.
      const list = document.createElement('datalist');
      list.id = `${id}-functions`;
      for (const name of this.choices ?? []) list.appendChild(new Option(name));
      input.setAttribute('list', list.id);
      row.appendChild(list);
      const script = this.designer.script;
      if (script && input.value && !this.functions.some((f) => f.toLowerCase() === input.value.trim().toLowerCase())) {
        row.classList.add('cr-designer-missing');
        input.title = `"${script.name}" has no function ${input.value} yet: a stub is added when the script is updated`;
      }
    }
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
let current = null;     // the designer last pressed in: it has the keys when nothing has the focus

export class DesignerWindow extends Window {
  /** @param {{ root?: object, name?: string }} options - a composite to start with */
  constructor({ root = null, name = '', ...options } = {}) {
    installStyle();
    const offset = (opened++ % 6) * 24;
    super({ title: 'Designer', x: 90 + offset, y: 60 + offset, width: 1120, height: 580, minWidth: 600, minHeight: 320, ...options });
    this.element.classList.add('cr-designer-window');
    this.root = root ?? newNode('VPanel');
    this.selected = this.root;       // the widget selected (the first, of several)
    this.others = [];                // the rest of a selection of several (Shift+click adds to it)
    this.history = new History();    // for Undo and Redo
    this.script = null;              // the script the design is linked to: { id, name, content }
    this.scripts = [];               // the user's scripts, for the Script menu
    this.sampleData = true;          // empty lists show sample rows in the Preview
    this.dirty = false;
    this.names = [];                 // saved composites, for the Open menu
    this.codeWindow = null;          // the open Code window, which follows the design
    this.viewport = null;
    this.previewSize = PREVIEW_SIZES[0];   // the screen the Preview shows (Size menu)

    this.outlineList = new ListPanel();
    this.paletteList = new ListPanel({ items: paletteRows() });
    this.paletteSearch = new NameField('search the palette');
    this.paletteSearch.fixedHeight = 24;
    this.paletteSearch.element.type = 'search';
    this.paletteSearch.element.addEventListener('input', () => { this.paletteList.items = paletteRows(this.paletteSearch.value); });
    this.preview = new PreviewPanel(this);
    this.inspector = new InspectorPanel(this);
    const left = new VSplitPanel({ first: titled('Outline', this.outlineList), second: this._paletteColumn(), position: 0.55 });
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
    for (const template of TEMPLATES) newMenu.addItem(`Template: ${template.name}`, () => this.newFromTemplate(template));
    newMenu.addSeparator();
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
    editMenu.addItem('Undo  (Ctrl+Z)', () => this.undo(), { enabled: () => this.history.canUndo });
    editMenu.addItem('Redo  (Ctrl+Y)', () => this.redo(), { enabled: () => this.history.canRedo });
    editMenu.addSeparator();
    editMenu.addItem('Cut  (Ctrl+X)', () => this.cut(), { enabled: () => this.selected !== this.root });
    editMenu.addItem('Copy  (Ctrl+C)', () => this.copy());
    editMenu.addItem('Paste  (Ctrl+V)', () => this.paste(), { enabled: () => clipboard !== null });
    editMenu.addItem('Duplicate  (Ctrl+D)', () => this.duplicate(), { enabled: () => this.selected !== this.root });
    editMenu.addSeparator();
    editMenu.addItem('Edit the text  (Enter)', () => this.preview.editText(this.selected));
    bar.add(editMenu);
    const arrangeMenu = new Menu('Arrange');
    for (const [how, label] of Object.entries(ALIGNMENTS)) {
      if (how === 'top' || how === 'across') arrangeMenu.addSeparator();
      arrangeMenu.addItem(label, () => this.align(how), { enabled: () => this.others.length > 0 });
    }
    arrangeMenu.addSeparator();
    arrangeMenu.addItem('Move up', () => this.move(-1), { enabled: () => this.selected !== this.root });
    arrangeMenu.addItem('Move down', () => this.move(1), { enabled: () => this.selected !== this.root });
    arrangeMenu.addItem('Wrap in a row', () => this.wrap('HPanel'), { enabled: () => this.selected !== this.root });
    arrangeMenu.addItem('Wrap in a column', () => this.wrap('VPanel'), { enabled: () => this.selected !== this.root });
    bar.add(arrangeMenu);
    this.scriptMenu = new Menu('Script');
    this.scriptMenu.itemsProvider = () => this._scriptItems();
    bar.add(this.scriptMenu);
    this.nameField = bar.add(new NameField('composite name'));
    this.nameField.value = name;
    bar.addButton('Save', () => this.save());
    bar.add(new Spacer(0)).fixedWidth = 8;
    bar.addButton('Add', () => this.addFromPalette());
    bar.addButton('Delete', () => this.deleteSelected());
    this.testButton = bar.addButton('Test', () => this.toggleTest());
    this.runButton = bar.addButton('Run', () => this.toggleRun());
    bar.addButton('Code', () => this.showCode());
    this.sizeMenu = new Menu('Size');
    for (const choice of PREVIEW_SIZES) {
      this.sizeMenu.addItem(choice.label, () => this.setPreviewSize(choice), { checked: () => this.previewSize === choice });
    }
    this.sizeMenu.addSeparator();
    this.sizeMenu.addItem('A phone beside it (360 x 640)', () => this.toggleMirror(), { checked: () => this.preview.mirror !== null });
    this.sizeMenu.addItem('Sample rows in empty lists', () => this.toggleSampleData(), { checked: () => this.sampleData });
    bar.add(this.sizeMenu);
    bar.add(new Spacer());
    this.statusLabel = bar.add(new Label(''));

    this.nameField.element.addEventListener('input', () => this._title());
    this.element.addEventListener('keydown', (e) => this._key(e));
    // A menu that has closed leaves the focus nowhere (on the page's body): the keys still belong to the
    // designer whose menu it was (Ctrl+Z after an Arrange), until something outside it is pressed.
    this._pressed = (e) => { current = this.element.contains(e.target) ? this : (current === this ? null : current); };
    this._bodyKey = (e) => { if (current === this && e.target === document.body && this.parent) this._key(e); };
    document.addEventListener('pointerdown', this._pressed, true);
    document.addEventListener('keydown', this._bodyKey);
    this.element.addEventListener('close', (e) => {
      if (e.target !== this.element) return;
      if (this.dirty && !confirm(`Discard unsaved changes to "${this.name || 'the new composite'}"?`)) { e.preventDefault(); return; }
      this.preview.stopRun();
      this._closeContext();
      document.removeEventListener('pointerdown', this._pressed, true);
      document.removeEventListener('keydown', this._bodyKey);
      if (current === this) current = null;
      this.codeWindow?.close();
    });
    this.history.reset(this._state());
    this._title();
    this.refreshNames();
    this.refreshScripts();
  }

  /** The Palette: its caption, a box to search it, and the classes in groups. */
  _paletteColumn() {
    const column = new VPanel();
    const label = new Label('Palette (double-click, or drag to the Preview)');
    label.element.classList.add('cr-designer-caption');
    label.fixedHeight = 20;
    column.add(label);
    column.add(this.paletteSearch);
    this.paletteList.flex = 1;
    column.add(this.paletteList);
    return column;
  }

  /**
   * The designer's keys, unless a text field has the focus (it has its own)
   * or the Preview is being tested or run. Anywhere in the window: Ctrl+Z
   * and Ctrl+Y (or Ctrl+Shift+Z) undo and redo; Ctrl+X, C, V and D cut,
   * copy, paste and duplicate. With the focus on the Preview: the arrows
   * nudge the selection a pixel (ten with Shift), Delete removes it, and
   * Enter edits its text.
   */
  _key(e) {
    if (this.preview.testing || e.altKey) return;
    const t = e.target;
    if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    const key = e.key.toLowerCase();
    let action = null;
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z') action = e.shiftKey ? () => this.redo() : () => this.undo();
      else if (!e.shiftKey) {
        action = {
          y: () => this.redo(), x: () => this.cut(), c: () => this.copy(), v: () => this.paste(), d: () => this.duplicate(),
        }[key] ?? null;
      }
    } else if (this.preview.element.contains(t)) {
      const step = e.shiftKey ? 10 : 1;
      action = {
        arrowleft: () => this.nudge(-step, 0), arrowright: () => this.nudge(step, 0),
        arrowup: () => this.nudge(0, -step), arrowdown: () => this.nudge(0, step),
        delete: () => this.deleteSelected(), backspace: () => this.deleteSelected(),
        enter: () => this.preview.editText(this.selected), f2: () => this.preview.editText(this.selected),
      }[key] ?? null;
    }
    if (!action) return;
    e.preventDefault();
    action();
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
    return !parent || isFreeParent(parent);
  }

  /** Shows the tree again after an edit: outline, preview and properties. */
  refresh() {
    const rows = outline(this.root);
    if (!rows.some((r) => r.node === this.selected)) this.selected = this.root;
    this.others = this.others.filter((n) => n !== this.selected && n !== this.root && rows.some((r) => r.node === n));
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
    this.history.record(this._state());
  }

  /** Every widget selected: the first (whose properties show), then the others. */
  get selection() { return [this.selected, ...this.others]; }

  /**
   * Selects node alone; or with toggle (Shift+click) adds it to the
   * selection, or takes it out if it is there. The root is only ever
   * selected alone.
   */
  select(node, { toggle = false } = {}) {
    if (toggle && node !== this.root && this.selected !== this.root) {
      if (node === this.selected) {
        if (!this.others.length) return;
        this.selected = this.others.shift();
      } else if (this.others.includes(node)) {
        this.others = this.others.filter((n) => n !== node);
      } else {
        this.others.push(node);
      }
    } else {
      if (node === this.selected && !this.others.length) return;
      this.selected = node;
      this.others = [];
    }
    this.outlineList.select(outline(this.root).findIndex((r) => r.node === this.selected));
    this.inspector.render(this.selected);
    this.preview.reveal(this.selected);
    if (this.others.length) this.status(`${this.others.length + 1} widgets selected`);
  }

  // ---- undo and redo

  /** The design and what is selected in it (by place in the Outline), as the History keeps them. */
  _state() {
    const rows = outline(this.root);
    return { root: this.root, selected: this.selection.map((n) => rows.findIndex((r) => r.node === n)) };
  }

  _restore(state, what) {
    this.root = state.root;
    const rows = outline(this.root);
    const nodes = state.selected.map((i) => rows[i]?.node).filter(Boolean);
    this.selected = nodes[0] ?? this.root;
    this.others = nodes.slice(1);
    this.dirty = true;
    this._title();
    this.refresh();
    this.status(what);
  }

  undo() {
    const state = this.history.undo();
    if (state) this._restore(state, 'Undone'); else this.status('Nothing to undo', 'error');
  }

  redo() {
    const state = this.history.redo();
    if (state) this._restore(state, 'Redone'); else this.status('Nothing to redo', 'error');
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
    this.others = [];
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
    this.others = [];
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
    if (isList(parent)) {
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
    if (!cls) { this.status('Pick a class in the Palette first (not a group\'s heading)', 'error'); return; }
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
    this.others = [];
    this.status(`Added a ${cls}`);
    this.changed();
  }

  /** Deletes the selection: the widget selected, or every widget of a selection of several. */
  deleteSelected() {
    const nodes = this.selection;
    const parent = parentOf(this.root, this.selected);
    let deleted = 0;
    for (const node of nodes) {
      if (!isWithin(node, this.root)) continue;   // it went with a widget that held it
      const problem = removeNode(this.root, node);
      if (problem) { this.status(problem, 'error'); if (!deleted) return; break; }
      deleted += 1;
    }
    this.selected = parent && isWithin(parent, this.root) ? parent : this.root;
    this.others = [];
    this.status(deleted === 1 ? `Deleted a ${nodes[0].class}` : `Deleted ${deleted} widgets`);
    this.changed();
  }

  /** Adds a copy of the selected widget (and everything in it) right after it, and selects the copy. */
  duplicate() {
    const node = this.selected;
    const parent = parentOf(this.root, node);
    if (!parent) { this.status('The root cannot be duplicated', 'error'); return; }
    const copy = cloneNode(node);
    makeIdsUnique(this.root, copy);
    const index = isList(parent) ? childrenOf(parent).indexOf(node) + 1 : undefined;
    const problem = insertChild(parent, copy, index);
    if (problem) { this.status(problem, 'error'); return; }
    if (isFreeParent(parent) && copy.box) { copy.box[0] += 12; copy.box[1] += 12; }
    this.selected = copy;
    this.others = [];
    this.status(`Duplicated the ${node.class}`);
    this.changed();
  }

  /** Puts the selected widget inside a new row (HPanel) or column (VPanel) that takes its place. */
  wrap(cls) {
    const { node, problem } = wrapNode(this.root, this.selected, cls);
    if (problem) { this.status(problem, 'error'); return; }
    this.selected = node;
    this.others = [];
    this.status(`Wrapped it in a ${cls}: add more widgets to it`);
    this.changed();
  }

  /** Lines the selected widgets up, or spaces them evenly (how: a key of ALIGNMENTS). */
  align(how) {
    const nodes = this.selection;
    if (!sharedFreeParent(this.root, nodes)) {
      this.status('Select two or more widgets placed freely in the same Panel (Shift+click adds one)', 'error');
      return;
    }
    const problem = alignNodes(nodes, how);
    if (problem) { this.status(problem, 'error'); return; }
    this.status(`${ALIGNMENTS[how]}: ${nodes.length} widgets`);
    this.changed();
  }

  /** Moves the selected widgets that are placed freely by (dx, dy) pixels. */
  nudge(dx, dy) {
    const nodes = this.selection.filter((n) => this.isFree(n));
    if (!nodes.length) {
      this.status('Only a widget placed freely (in a Panel) can be nudged: Up and Down move it in a row or column', 'error');
      return;
    }
    for (const node of nodes) {
      const fields = fieldsFor(node, { isRoot: node === this.root, parent: parentOf(this.root, node) }).flatMap(([, fs]) => fs);
      const at = (key) => Number(getField(node, fields.find((f) => f.key === key && f.type === 'number')) ?? 0) || 0;
      this.applyPlace(node, { left: at('left') + dx, top: at('top') + dy });
    }
    this.changed();
  }

  // ---- the menu of a right click

  _closeContext() {
    this._context?.remove();
    this._context = null;
    if (this._contextOff) document.removeEventListener('pointerdown', this._contextOff, true);
    if (this._contextKey) document.removeEventListener('keydown', this._contextKey, true);
  }

  /** Opens the menu for the selection at (x, y) on the page: what Edit and Arrange do, close to hand. */
  showContextMenu(x, y) {
    this._closeContext();
    const several = this.others.length > 0;
    const notRoot = this.selected !== this.root;
    const items = [
      ['Edit the text', () => this.preview.editText(this.selected), !several],
      null,
      ['Cut', () => this.cut(), notRoot],
      ['Copy', () => this.copy(), true],
      ['Paste', () => this.paste(), clipboard !== null],
      ['Duplicate', () => this.duplicate(), notRoot],
      ['Delete', () => this.deleteSelected(), notRoot],
      null,
      ['Wrap in a row', () => this.wrap('HPanel'), notRoot],
      ['Wrap in a column', () => this.wrap('VPanel'), notRoot],
      ['Move up', () => this.move(-1), notRoot],
      ['Move down', () => this.move(1), notRoot],
      ...(several ? [null, ...Object.entries(ALIGNMENTS).map(([how, label]) => [label, () => this.align(how), true])] : []),
    ];
    const menu = document.createElement('ul');
    menu.className = 'cr-designer-context';
    menu.setAttribute('role', 'menu');
    for (const item of items) {
      const li = document.createElement('li');
      if (!item) { li.className = 'cr-designer-line'; menu.appendChild(li); continue; }
      const [label, action, enabled] = item;
      li.textContent = label;
      li.setAttribute('role', 'menuitem');
      if (!enabled) li.className = 'cr-designer-off';
      li.addEventListener('click', () => { this._closeContext(); action(); });
      menu.appendChild(li);
    }
    document.body.appendChild(menu);
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight - 4))}px`;
    this._context = menu;
    this._contextOff = (e) => { if (!menu.contains(e.target)) this._closeContext(); };
    this._contextKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this._closeContext(); } };
    document.addEventListener('pointerdown', this._contextOff, true);
    document.addEventListener('keydown', this._contextKey, true);
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

  toggleMirror() {
    this.preview.setMirror(this.preview.mirror ? null : { width: 360, height: 640 });
    this.status(this.preview.mirror ? 'A phone (360 x 640) shows the design beside the Preview' : '');
  }

  toggleSampleData() {
    this.sampleData = !this.sampleData;
    this.preview.render();
  }

  toggleTest() {
    const wasRunning = this.preview.running;
    if (wasRunning) this.preview.stopRun();
    this.preview.testing = wasRunning ? true : !this.preview.testing;
    this.testButton.label = this.preview.testing ? 'Design' : 'Test';
    this.runButton.label = 'Run';
    this.status(this.preview.testing ? 'Testing: the widgets work, but no program runs (Run does that)' : '');
    this.preview.render();
  }

  /**
   * The program for the design: the linked script with its layout section
   * rebuilt from the design, or with no script the generated program.
   */
  program() {
    const options = { language: 'python', name: this.name };
    return this.script ? linkCode(this.script.content, this.root, options).text : generateCode(this.root, options);
  }

  /**
   * Run: the design's program runs with the Preview as its screen, so its
   * handlers answer the widgets and what they animate (a Carousel, a Stack,
   * a Drawer) can be tried. Stop shows the design again.
   */
  toggleRun() {
    if (this.preview.running) { this.stopRun(); return; }
    let source;
    try {
      source = this.program();
    } catch (err) {
      this.status(err.message, 'error');
      return;
    }
    const { process, errorCount } = this.preview.startRun(source, this.name || 'design');
    this.runButton.label = 'Stop';
    this.testButton.label = 'Test';
    if (process) this.status(`Running ${this.script ? `"${this.script.name}" with this design` : 'the generated program'}: Stop shows the design again`);
    else this.status(`The program did not load (${errorCount} error${errorCount === 1 ? '' : 's'}): see the foot of the Preview`, 'error');
  }

  stopRun() {
    this.preview.stopRun();
    this.preview.testing = false;
    this.runButton.label = 'Run';
    this.testButton.label = 'Test';
    this.status('');
    this.preview.render();
  }

  /** The program run in the Preview has ended by itself. */
  runExited(process) {
    if (process.state === 'failed') this.status('The program stopped with an error: see the foot of the Preview', 'error');
  }

  // ---- the linked script

  /** The key under which this browser remembers which script a composite is linked to. */
  _linkKey(name = this.name) { return `fastblips.designerScript:${spaceName() ?? ''}/${name}`; }

  _rememberLink() {
    if (!this.name) return;
    try {
      if (this.script) globalThis.localStorage?.setItem(this._linkKey(), this.script.name);
      else globalThis.localStorage?.removeItem(this._linkKey());
    } catch { /* not remembered */ }
  }

  _scriptItems() {
    const linked = this.script;
    const off = { enabled: () => false };
    const others = this.scripts.filter((s) => s.id !== linked?.id);
    return [
      ...(linked ? [
        { label: `Linked to "${linked.name}"`, action: () => {}, ...off },
        { label: 'Update the script from the design', action: () => this.updateScript() },
        { label: 'Read the script again', action: () => this.linkScript(linked) },
        { label: 'Unlink', action: () => this.unlinkScript() },
      ] : [{ label: '(not linked to a script)', action: () => {}, ...off }]),
      { separator: true },
      ...(others.length ? others.map((s) => ({ label: `Link to ${s.name}`, action: () => this.linkScript(s) }))
        : [{ label: spaceName() ? '(no other Python scripts)' : '(sign in to see your scripts)', action: () => {}, ...off }]),
      { separator: true },
      { label: 'Refresh list', action: () => this.refreshScripts() },
    ];
  }

  _scriptStore() {
    const space = spaceName();
    return space ? scriptStore().inSpace(space) : null;
  }

  /** Reads the names of the user's Python scripts, for the Script menu. */
  async refreshScripts() {
    const store = this._scriptStore();
    if (!store) { this.scripts = []; return; }
    try {
      this.scripts = (await store.list()).filter((s) => (s.language ?? 'python') === 'python')
        .map((s) => ({ id: s.id, name: s.name })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } catch (err) {
      this.status(err.message, 'error');
    }
  }

  /**
   * Links the design to a script ({ id, name }): its functions can be picked
   * for the events, Run runs it with the design, and Update writes the
   * design's layout into it.
   */
  async linkScript({ id, name }) {
    const store = this._scriptStore();
    if (!store) { this.status('Sign in first: scripts are in your own space', 'error'); return; }
    this.status(`Reading ${name}...`);
    try {
      const record = await store.get(id);
      this.script = { id: record.id, name: record.name, content: String(record.content ?? '') };
      this._rememberLink();
      this._linked();
    } catch (err) {
      this.status(err.message, 'error');
    }
  }

  /** Says what the link gives, and what the design names that the script lacks. */
  _linked() {
    const functions = functionsIn(this.script.content);
    let missing = [];
    try { missing = missingHandlers(this.root, this.script.content); } catch { /* nothing to say */ }
    this.inspector.render(this.selected);
    this.codeWindow?.refresh();
    this.status(missing.length
      ? `Linked to "${this.script.name}", which has no ${missing.join(', ')} yet: Update the script adds ${missing.length === 1 ? 'a stub' : 'stubs'}`
      : `Linked to "${this.script.name}": ${functions.length} function${functions.length === 1 ? '' : 's'} to pick from for events`,
    missing.length ? 'error' : undefined);
  }

  unlinkScript() {
    this.script = null;
    this._rememberLink();
    this.inspector.render(this.selected);
    this.codeWindow?.refresh();
    this.status('Not linked to a script: Run uses the generated program');
  }

  /** Writes the design into the linked script: its layout section, and a stub for each handler it lacks. */
  async updateScript() {
    const store = this._scriptStore();
    if (!store || !this.script) { this.status('Link a script first (Script menu)', 'error'); return; }
    this.status(`Updating ${this.script.name}...`);
    try {
      const fresh = await store.get(this.script.id);   // the script as it is now, not as it was when linked
      const { text, added } = linkCode(String(fresh.content ?? ''), this.root, { language: 'python', name: this.name });
      await store.update(this.script.id, { content: text, compiled_code: null });   // its compiled code no longer matches
      this.script.content = text;
      this.inspector.render(this.selected);
      this.codeWindow?.refresh();
      this.status(`Updated "${this.script.name}"${added.length ? `: added ${added.join(', ')}` : ''}`);
    } catch (err) {
      this.status(err.message, 'error');
    }
  }

  /** Links again to the script this browser remembers for the composite just opened, if there is one. */
  async _restoreLink() {
    this.script = null;
    let wanted = null;
    try { wanted = globalThis.localStorage?.getItem(this._linkKey()); } catch { /* none remembered */ }
    const store = wanted ? this._scriptStore() : null;
    if (!store) return;
    try {
      const found = (await store.findByName(wanted)).find((s) => s.name === wanted);
      if (found) await this.linkScript(found);
    } catch { /* the design opens without its link */ }
  }

  // ---- files

  _discardOk() {
    return !this.dirty || confirm(`Discard unsaved changes to "${this.name || 'the new composite'}"?`);
  }

  newComposite(cls) {
    if (!this._discardOk()) return;
    this._start(newNode(cls), '');
    this.status(`New composite: a ${cls}`);
  }

  /** Starts a new composite from a starter design (one of TEMPLATES). */
  newFromTemplate(template) {
    if (!this._discardOk()) return;
    this._start(template.build(), '');
    this.status(`New from the ${template.name} template: ${template.description}`);
  }

  /** Shows a design to start work on: a new one, or one just opened. Undo starts from here. */
  _start(root, name) {
    if (this.preview.running) this.stopRun();
    this.root = root;
    this.selected = this.root;
    this.others = [];
    this.script = null;
    this.nameField.value = name;
    this.dirty = false;
    this.history.reset(this._state());
    this._title();
    this.refresh();
  }

  async openComposite(name) {
    if (!this._discardOk()) return;
    this.status(`Opening ${name}...`);
    try {
      const doc = await fetchDoc(name, 'composite');
      this._start(doc.root, name);
      this.status(`Opened ${name}`);
      await this._restoreLink();
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
      this._rememberLink();
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

