// MonacoPanel: a TextPanel whose text is edited in a Monaco editor (the
// editor behind VS Code), with syntax highlighting for a chosen language
// (see docs/widgets.txt).
//
// Monaco is loaded from a CDN the first time a MonacoPanel is created. Until
// it arrives - or for good, if the page is offline - the panel works as a
// plain TextPanel, and whatever was typed carries over into the editor.
//
// A panel made with breakpoints: true is a debugger's source view: clicking
// in the margin (or pressing F9) sets or clears a breakpoint on that line,
// and debugLine highlights the line a program is stopped at.

import { TextPanel } from './text-panel.js';
import { themeValue, defineMonacoThemes } from '../theme.js';
import { codeFontFamily } from '../fonts.js';

const MONACO_VERSION = '0.52.2';
const MONACO_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;

// A breakpoint is a red dot in the margin; the line a program is stopped at
// is tinted.
const STYLE = `
.cr-breakpoint-glyph{cursor:pointer;
  background:radial-gradient(circle closest-side,var(--cr-breakpoint,#e5484d) 58%,transparent 64%)}
.cr-debug-line{background:var(--cr-debug-line,rgba(255,196,0,.3))}
.cr-monaco-breakpoints .margin-view-overlays .line-numbers{cursor:pointer}
`;

function installStyle() {
  if (document.getElementById('cr-monaco-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-monaco-panel-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

let monacoPromise = null;

/** Loads Monaco once and resolves to the global `monaco` namespace. */
export function loadMonaco() {
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((resolve, reject) => {
    if (window.monaco?.editor) { resolve(window.monaco); return; }
    // Monaco's workers must come from the page's own origin, so each one is a
    // small data: script that imports the real worker from the CDN.
    window.MonacoEnvironment = {
      getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `self.MonacoEnvironment={baseUrl:'${MONACO_BASE}/'};`
        + `importScripts('${MONACO_BASE}/vs/base/worker/workerMain.js');`)}`,
    };
    const script = document.createElement('script');
    script.src = `${MONACO_BASE}/vs/loader.js`;
    script.onerror = () => reject(new Error('could not load the Monaco editor'));
    script.onload = () => {
      window.require.config({ paths: { vs: `${MONACO_BASE}/vs` } });
      window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
    };
    document.head.appendChild(script);
  });
  // Let a later panel try again after a failure.
  monacoPromise.catch(() => { monacoPromise = null; });
  // Monaco's theme is global: one listener keeps every editor in step.
  monacoPromise.then((monaco) => {
    defineMonacoThemes(monaco);   // before any editor is created with one
    monaco.editor.setTheme(themeValue('monaco'));
    document.addEventListener('cr-themechange', () => monaco.editor.setTheme(themeValue('monaco')));
    // Font is a per-editor option: update every live editor, then have
    // Monaco re-measure character widths for the new font.
    document.addEventListener('cr-fontchange', () => {
      for (const editor of monaco.editor.getEditors?.() ?? []) {
        editor.updateOptions({ fontFamily: codeFontFamily() });
      }
      monaco.editor.remeasureFonts?.();
    });
  }, () => {});
  return monacoPromise;
}

export class MonacoPanel extends TextPanel {
  /**
   * @param {{text?: string, readOnly?: boolean, language?: string, breakpoints?: boolean}} options
   *   language is a Monaco language id, e.g. 'vb' for VB.NET.
   *   breakpoints: true lets the user set breakpoints in the margin.
   */
  constructor({ language = 'plaintext', breakpoints = false, ...options } = {}) {
    super(options);
    installStyle();
    this.element.classList.add('cr-monaco-panel');
    this.element.classList.toggle('cr-monaco-breakpoints', Boolean(breakpoints));
    this.language = language;
    this.breakpointsEnabled = Boolean(breakpoints);
    this._breakpoints = new Set();   // the lines, until the editor keeps them
    this._breakpointMarks = null;    // the editor's decorations for them
    this._debugLine = null;
    this._debugMark = null;
    this.editor = null;
    this.ready = loadMonaco()
      .then((monaco) => this._createEditor(monaco))
      .catch(() => null);   // stay a plain TextPanel
  }

  _createEditor(monaco) {
    if (this._disposed) return null;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0';
    this.element.appendChild(host);
    this.editor = monaco.editor.create(host, {
      value: this.textArea.value,
      language: this.language,
      readOnly: this.textArea.readOnly,
      automaticLayout: true,
      glyphMargin: this.breakpointsEnabled,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: codeFontFamily(),
      tabSize: 2,
      theme: themeValue('monaco'),
    });
    const hadFocus = document.activeElement === this.textArea;
    this.textArea.hidden = true;
    this.editor.onDidChangeModelContent(() => {
      this.element.dispatchEvent(new CustomEvent('change', { detail: { text: this.text } }));
    });
    // Ctrl/Cmd+Enter would otherwise insert a line; report it as a 'submit'.
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      this.element.dispatchEvent(new CustomEvent('submit'));
    });
    if (this.breakpointsEnabled) this._createBreakpoints(monaco);
    if (hadFocus) this.editor.focus();
    return this.editor;
  }

  // ------------------------------------------------------------ breakpoints

  /**
   * Breakpoints are kept as editor decorations, so they move with their
   * lines as the source is edited. A click in the margin (the glyph column
   * or a line number) toggles one, as does F9 on the cursor's line; F10
   * fires a 'step' event (a console single-steps).
   */
  _createBreakpoints(monaco) {
    this._monaco = monaco;
    this._breakpointMarks = this.editor.createDecorationsCollection([]);
    this._debugMark = this.editor.createDecorationsCollection([]);
    this._showBreakpoints([...this._breakpoints]);
    this._showDebugLine();
    const Target = monaco.editor.MouseTargetType;
    this.editor.onMouseDown((e) => {
      const { type, position } = e.target;
      if ((type === Target.GUTTER_GLYPH_MARGIN || type === Target.GUTTER_LINE_NUMBERS) && position) {
        this.toggleBreakpoint(position.lineNumber);
      }
    });
    this.editor.addCommand(monaco.KeyCode.F9, () => {
      const position = this.editor.getPosition();
      if (position) this.toggleBreakpoint(position.lineNumber);
    });
    this.editor.addCommand(monaco.KeyCode.F10, () => {
      this.element.dispatchEvent(new CustomEvent('step'));
    });
  }

  _showBreakpoints(lines) {
    const monaco = this._monaco;
    const last = this.editor.getModel().getLineCount();
    this._breakpointMarks.set(lines.filter((line) => line >= 1 && line <= last).map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'cr-breakpoint-glyph',
        glyphMarginHoverMessage: { value: 'Breakpoint' },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    })));
  }

  _showDebugLine() {
    if (!this._debugMark) return;
    const line = this._debugLine;
    if (line === null || line > this.editor.getModel().getLineCount()) { this._debugMark.clear(); return; }
    this._debugMark.set([{
      range: new this._monaco.Range(line, 1, line, 1),
      options: { isWholeLine: true, className: 'cr-debug-line' },
    }]);
    this.editor.revealLineInCenterIfOutsideViewport(line);
  }

  /** The lines (from 1) with a breakpoint, in order. Setting them, or
   *  toggling one, fires a 'breakpointschange' event with detail
   *  { breakpoints }. */
  get breakpoints() {
    const lines = this._breakpointMarks
      ? new Set(this._breakpointMarks.getRanges().map((range) => range.startLineNumber))
      : this._breakpoints;
    return [...lines].sort((a, b) => a - b);
  }
  set breakpoints(lines) {
    const wanted = [...new Set([...lines].map(Number).filter((n) => Number.isInteger(n) && n >= 1))];
    if (this._breakpointMarks) this._showBreakpoints(wanted);
    else this._breakpoints = new Set(wanted);
    this.element.dispatchEvent(new CustomEvent('breakpointschange', { detail: { breakpoints: this.breakpoints } }));
  }

  /** Sets a breakpoint on a line, or clears the one there. Returns true if
   *  the line now has one. */
  toggleBreakpoint(line) {
    const lines = new Set(this.breakpoints);
    const had = lines.delete(line);
    if (!had) lines.add(line);
    this.breakpoints = lines;
    return !had;
  }

  clearBreakpoints() {
    if (this.breakpoints.length > 0) this.breakpoints = [];
  }

  /** The line shown as where a program is stopped (tinted, and scrolled
   *  into view), or null for none. */
  get debugLine() { return this._debugLine; }
  set debugLine(line) {
    this._debugLine = line ?? null;
    this._showDebugLine();
  }

  get text() { return this.editor ? this.editor.getValue() : super.text; }
  set text(value) {
    if (this.editor) this.editor.setValue(String(value));
    else super.text = value;
    // New text: the breakpoints and the stopped line were for the old one.
    if (!this._breakpoints) return;   // still in the TextPanel constructor
    this.clearBreakpoints();
    this.debugLine = null;
  }

  // The hidden text area keeps the flag, so the getter needs no editor.
  get readOnly() { return super.readOnly; }
  set readOnly(value) {
    super.readOnly = value;
    this.editor?.updateOptions({ readOnly: Boolean(value) });
  }

  append(value) {
    if (!this.editor) { super.append(value); return; }
    const model = this.editor.getModel();
    const end = model.getFullModelRange().getEndPosition();
    model.applyEdits([{ range: { startLineNumber: end.lineNumber, startColumn: end.column,
      endLineNumber: end.lineNumber, endColumn: end.column }, text: String(value) }]);
    this.editor.revealLine(model.getLineCount());
  }

  focus() {
    if (this.editor) this.editor.focus();
    else super.focus();
  }

  dispose() {
    this._disposed = true;
    this.editor?.dispose();
    this.editor = null;
    super.dispose();
  }
}
