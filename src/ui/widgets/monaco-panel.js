// MonacoPanel: a TextPanel whose text is edited in a Monaco editor (the
// editor behind VS Code), with syntax highlighting for a chosen language
// (see docs/widgets.txt).
//
// Monaco is loaded from a CDN the first time a MonacoPanel is created. Until
// it arrives - or for good, if the page is offline - the panel works as a
// plain TextPanel, and whatever was typed carries over into the editor.

import { TextPanel } from './text-panel.js';
import { themeValue, defineMonacoThemes } from '../theme.js';
import { codeFontFamily } from '../fonts.js';

const MONACO_VERSION = '0.52.2';
const MONACO_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;

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
   * @param {{text?: string, readOnly?: boolean, language?: string}} options
   *   language is a Monaco language id, e.g. 'vb' for VB.NET.
   */
  constructor({ language = 'plaintext', ...options } = {}) {
    super(options);
    this.element.classList.add('cr-monaco-panel');
    this.language = language;
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
    if (hadFocus) this.editor.focus();
    return this.editor;
  }

  get text() { return this.editor ? this.editor.getValue() : super.text; }
  set text(value) {
    if (this.editor) this.editor.setValue(String(value));
    else super.text = value;
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
