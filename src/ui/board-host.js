// The Board and the Canvas a program draws on (New Board() / Board(), New
// Canvas() / Canvas(), see src/vm/runtime/widgets.js): how the VM's calls
// reach a BoardPanel and a CanvasPanel.
//
// BoardBinding runs the Board class's methods on one BoardPanel, and
// CanvasBinding the Canvas class's on one CanvasPanel; both hosts use them.
// PhysicsBinding runs the Physics class's on one PhysicsPanel, and only a
// console has one. ConsoleOutputHost is a console's widget host (the VM's
// `gui` option): a console has no screen for widgets, but its output has a
// Board tab, a Canvas tab and a Physics tab, so those are the three classes it
// can make.

import { WidgetError } from '../vm/runtime/widgets.js';

/** Runs the Board class's methods (their Crumb names) on a BoardPanel. */
export class BoardBinding {
  /** @param {import('./widgets/board-panel.js').BoardPanel} board */
  constructor(board) {
    this.board = board;
    this._listeners = [];   // [type, listener] the program's handlers added
  }

  /** Removes the program's handlers and puts the board back as new: 8 by
   *  8, checkered, empty, its cells filling the panel. */
  reset() {
    for (const [type, listener] of this._listeners) this.board.element.removeEventListener(type, listener);
    this._listeners = [];
    this.board.checkered = true;
    this.board.squareCells = false;
    this.board.setSize(8, 8);
  }

  call(method, args) {
    try {
      return this._call(method, args);
    } catch (err) {
      // A cell that is not on the board, a size out of range.
      if (err instanceof RangeError) throw new WidgetError(err.message);
      throw err;
    }
  }

  _call(method, args) {
    const { board } = this;
    const [a, b, c] = args;
    switch (method) {
      case 'setSize': board.setSize(a, b); return undefined;
      case 'getRows': return board.rows;
      case 'getColumns': return board.columns;
      case 'setText': board.setText(a, b, c); return undefined;
      case 'getText': return board.getText(a, b);
      case 'setBackground': board.setBackground(a, b, c); return undefined;
      case 'getBackground': return board.getBackground(a, b);
      case 'setColor': board.setColor(a, b, c); return undefined;
      case 'getColor': return board.getColor(a, b);
      case 'setCheckered': board.checkered = a; return undefined;
      case 'isCheckered': return board.checkered;
      case 'setSquareCells': board.squareCells = a; return undefined;
      case 'isSquareCells': return board.squareCells;
      case 'select': board.select(a, b); return undefined;
      case 'clearSelection': board.clearSelection(); return undefined;
      case 'getSelectedRow': return board.selected?.row ?? -1;
      case 'getSelectedColumn': return board.selected?.column ?? -1;
      case 'clear': board.clear(); return undefined;
      case 'onClick': {
        const listener = (e) => a(e.detail.row, e.detail.column);
        board.element.addEventListener('cellclick', listener);
        this._listeners.push(['cellclick', listener]);
        return undefined;
      }
      default:
        throw new WidgetError(`a Board has no method '${method}'`);
    }
  }
}

/** Runs the Canvas class's methods (their Crumb names) on a CanvasPanel. */
export class CanvasBinding {
  /** @param {import('./widgets/canvas-panel.js').CanvasPanel} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this._listeners = [];   // [type, listener] the program's handlers added
  }

  /** Removes the program's handlers and puts the canvas back as new. */
  reset() {
    for (const [type, listener] of this._listeners) this.canvas.element.removeEventListener(type, listener);
    this._listeners = [];
    this.canvas.reset();
  }

  call(method, args) {
    try {
      return this._call(method, args);
    } catch (err) {
      // A size out of range, too many 3D shapes.
      if (err instanceof RangeError) throw new WidgetError(err.message);
      throw err;
    }
  }

  _listen(type, listener) {
    this.canvas.element.addEventListener(type, listener);
    this._listeners.push([type, listener]);
  }

  _call(method, args) {
    const { canvas } = this;
    const [a] = args;
    switch (method) {
      case 'getWidth': return canvas.width;
      case 'getHeight': return canvas.height;
      case 'setBackground': canvas.background = a; return undefined;
      case 'setColor': canvas.color = a; return undefined;
      case 'setLineWidth': canvas.lineWidth = a; return undefined;
      case 'setFontSize': canvas.fontSize = a; return undefined;
      case 'setAutoUpdate': canvas.autoUpdate = a; return undefined;
      case 'isAutoUpdate': return canvas.autoUpdate;
      case 'isKeyDown': return canvas.isKeyDown(a);
      case 'getMouseX': return canvas.mouseX;
      case 'getMouseY': return canvas.mouseY;
      case 'onClick': this._listen('canvasclick', (e) => a(e.detail.x, e.detail.y)); return undefined;
      case 'onKey': this._listen('canvaskey', (e) => a(e.detail.key)); return undefined;
      // The rest are the CanvasPanel's own methods, with the same names
      // and arguments.
      case 'setSize': case 'clear': case 'update':
      case 'point': case 'line': case 'rect': case 'fillRect': case 'circle': case 'fillCircle':
      case 'triangle': case 'fillTriangle': case 'text':
      case 'setCamera': case 'lookAt': case 'orbit':
      case 'line3d': case 'triangle3d': case 'fillTriangle3d': case 'box3d': case 'fillBox3d':
        canvas[method](...args);
        return undefined;
      default:
        throw new WidgetError(`a Canvas has no method '${method}'`);
    }
  }
}

/** Runs the Physics class's methods (their Crumb names) on a PhysicsPanel's world. */
export class PhysicsBinding {
  /** @param {import('./widgets/physics-panel.js').PhysicsPanel} panel */
  constructor(panel) {
    this.panel = panel;
    this._listeners = [];   // [type, listener] the program's click handlers added
    this._collide = [];     // the program's onCollide handlers
  }

  /** Removes the program's handlers and puts the panel back as new (with its demo ball). */
  reset() {
    for (const [type, listener] of this._listeners) this.panel.element.removeEventListener(type, listener);
    this._listeners = [];
    this._collide = [];
    this.panel.reset();
  }

  /** A program made its Physics: its world is new and empty. */
  start() {
    this.reset();
    this.panel.startProgram();
    this.panel.world.onCollide = (a, b) => { for (const handler of this._collide) handler(a, b); };
  }

  call(method, args) {
    try {
      return this._call(method, args);
    } catch (err) {
      // A shape that is not there, a size out of range, too many shapes.
      if (err instanceof RangeError) throw new WidgetError(err.message);
      throw err;
    }
  }

  _call(method, args) {
    const { world } = this.panel;
    const [a, b, c, d] = args;
    switch (method) {
      case 'setSize': world.setSize(a, b); this.panel.layout(); return undefined;
      case 'getWidth': return Math.round(world.width);
      case 'getHeight': return Math.round(world.height);
      case 'setBackground': world.setBackground(a); return undefined;
      case 'setGravity': world.setGravity(a, b); return undefined;
      case 'setWalls': world.setWalls(a); return undefined;
      case 'setPaused': world.setPaused(a); return undefined;
      case 'isPaused': return world.paused;
      case 'clear': world.clear(); return undefined;
      case 'getCount': return world.count;
      case 'addCircle': return world.addCircle(a, b, c);
      case 'addBall': return world.addBall(a, b, c);
      case 'addRect': return world.addRect(a, b, c, d);
      case 'addEllipse': return world.addEllipse(a, b, c, d);
      case 'addPolygon': return world.addPolygon(a, b, c, d);
      case 'removeBody': world.remove(a); return undefined;
      case 'setColor': world.setColor(a, b); return undefined;
      case 'setLabel': world.setLabel(a, b); return undefined;
      case 'setFixed': world.setFixed(a, b); return undefined;
      case 'setPosition': world.setPosition(a, b, c); return undefined;
      case 'setVelocity': world.setVelocity(a, b, c); return undefined;
      case 'setAngle': world.setAngle(a, b); return undefined;
      case 'setSpin': world.setSpin(a, b); return undefined;
      case 'setBounce': world.setBounce(a, b); return undefined;
      case 'setFriction': world.setFriction(a, b); return undefined;
      case 'applyImpulse': world.applyImpulse(a, b, c); return undefined;
      case 'getX': return world.body(a).x;
      case 'getY': return world.body(a).y;
      case 'getAngle': return (world.body(a).angle * 180) / Math.PI;
      case 'getVx': return world.body(a).vx;
      case 'getVy': return world.body(a).vy;
      case 'bodyAt': return world.bodyAt(a, b)?.id ?? 0;
      case 'onClick': {
        const listener = (e) => a(e.detail.x, e.detail.y);
        this.panel.element.addEventListener('physicsclick', listener);
        this._listeners.push(['physicsclick', listener]);
        return undefined;
      }
      case 'onCollide': this._collide.push(a); return undefined;
      default:
        throw new WidgetError(`a Physics has no method '${method}'`);
    }
  }
}

const IDS = { Board: 1, Canvas: 2, Physics: 3 };

/**
 * A console's widget host. Its only widgets are the console's board, canvas
 * and physics world: create('Board'), create('Canvas') and create('Physics')
 * give them (the same id every time) and show their tab; any other class
 * needs a screen.
 */
export class ConsoleOutputHost {
  /** @param {import('./widgets/output-panel.js').OutputPanel} outputPanel */
  constructor(outputPanel) {
    this.outputPanel = outputPanel;
    this.bindings = {
      Board: new BoardBinding(outputPanel.boardPanel),
      Canvas: new CanvasBinding(outputPanel.canvasPanel),
    };
    if (outputPanel.physicsPanel) this.bindings.Physics = new PhysicsBinding(outputPanel.physicsPanel);
    this._made = new Map();   // id -> class name, for the ones the program has made
  }

  /** Before each run: the board, the canvas and the physics world as new, with no handlers. */
  reset() {
    this._made.clear();
    for (const binding of Object.values(this.bindings)) binding.reset();
  }

  create(className) {
    const id = Object.hasOwn(this.bindings, className) ? IDS[className] : 0;
    if (!id) {
      throw new WidgetError(`a ${className} needs a screen to go on, and a console has only a Board, a Canvas and a Physics: `
        + 'run the program from a launch window (the console\'s Launch menu) or a ?run= page');
    }
    this._made.set(id, className);
    if (className === 'Physics') this.bindings.Physics.start();   // a new, empty world
    this.outputPanel.selectTab(className);
    return id;
  }

  has(id) { return this._made.has(id); }

  classOf(id) { return this._made.get(id); }

  call(id, method, args) { return this.bindings[this._made.get(id)].call(method, args); }
}
