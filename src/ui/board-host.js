// The Board and the Canvas a program draws on (New Board() / Board(), New
// Canvas() / Canvas(), see src/vm/runtime/widgets.js): how the VM's calls
// reach a BoardPanel and a CanvasPanel.
//
// BoardBinding runs the Board class's methods on one BoardPanel, and
// CanvasBinding the Canvas class's on one CanvasPanel; both hosts use them.
// ConsoleOutputHost is a console's widget host (the VM's `gui` option): a
// console has no screen for widgets, but its output has a Board tab and a
// Canvas tab, so those are the two classes it can make.

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

const IDS = { Board: 1, Canvas: 2 };

/**
 * A console's widget host. Its only widgets are the console's board and
 * canvas: create('Board') and create('Canvas') give them (the same id every
 * time) and show their tab; any other class needs a screen.
 */
export class ConsoleOutputHost {
  /** @param {import('./widgets/output-panel.js').OutputPanel} outputPanel */
  constructor(outputPanel) {
    this.outputPanel = outputPanel;
    this.bindings = {
      Board: new BoardBinding(outputPanel.boardPanel),
      Canvas: new CanvasBinding(outputPanel.canvasPanel),
    };
    this._made = new Map();   // id -> class name, for the ones the program has made
  }

  /** Before each run: the board and the canvas as new, with no handlers. */
  reset() {
    this._made.clear();
    for (const binding of Object.values(this.bindings)) binding.reset();
  }

  create(className) {
    const id = IDS[className];
    if (!id) {
      throw new WidgetError(`a ${className} needs a screen to go on, and a console has only a Board and a Canvas: `
        + 'run the program from a launch window (the console\'s Launch menu) or a ?run= page');
    }
    this._made.set(id, className);
    this.outputPanel.selectTab(className);
    return id;
  }

  has(id) { return this._made.has(id); }

  classOf(id) { return this._made.get(id); }

  call(id, method, args) { return this.bindings[this._made.get(id)].call(method, args); }
}
