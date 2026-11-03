// SourceWindow: the source a launch window runs, opened by its Show source
// button, in a SourceEditor: one script in a code editor; several (a
// project's) each get a tab, in the order they run. The source can be edited;
// the Compile button, enabled once it differs from what was last compiled,
// compiles the edits and later Gos run them.

import { Window } from './window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { TabPanel } from '../widgets/tab-panel.js';

export class SourceWindow extends Window {
  /**
   * @param {object} options - Window options, plus
   * @param {string} [options.title] - what is shown: the launch window's title
   * @param {{name: string, source: string}[]} options.scripts - the scripts, in order
   * @param {Function} [options.onCompile] - if given, a Compile button calls
   *   it with the SourceEditor (see SourceEditor.compileWith)
   */
  constructor({ title = '', scripts = [], onCompile = null, ...options } = {}) {
    super({
      width: 520, height: 440, minWidth: 280, minHeight: 180,
      ...options,
      title: `Source: ${title || 'Program'}`,
    });
    this.element.classList.add('cr-source-window');
    this.scripts = scripts.map((s) => ({ name: String(s.name ?? ''), source: String(s.source ?? '') }));
    this.editor = new SourceEditor(this.scripts, {
      onChange: (editor) => { if (this.compileButton) this.compileButton.enabled = editor.changed; },
    });
    this.content = this.editor.view;
    if (this.content instanceof TabPanel) this.tabs = this.content;
    if (onCompile) {
      this.compileButton = this.buttonBar.addButton('Compile', () => onCompile(this.editor));
      this.compileButton.enabled = false;
    }
    this.buttonBar.addButton('Close', () => this.close());
  }
}

/**
 * SourceEditor: editable scripts ({name, source}, in order) - view is a code
 * editor for one script, or a TabPanel with one editor per script - that
 * knows the sources last compiled, so a Compile button can be enabled only
 * when they have been changed. Used by SourceWindow, MobileLaunchWindow and
 * the ?app= page (which show it in place of the output).
 */
export class SourceEditor {
  /**
   * @param {{name: string, source: string}[]} scripts
   * @param {{onChange?: (editor: SourceEditor) => void}} [options] - onChange
   *   is called after each edit, and after compileWith()
   */
  constructor(scripts, { onChange = null } = {}) {
    this.names = scripts.map((s) => String(s.name ?? ''));
    /** The sources as last compiled (at first, as given). */
    this.compiledSources = scripts.map((s) => String(s.source ?? ''));
    this._onChange = onChange;
    this.editors = this.compiledSources.map((text) => new MonacoPanel({ text, language: 'python' }));
    for (const e of this.editors) e.element.addEventListener('change', () => this._onChange?.(this));
    if (this.editors.length === 1) {
      this.view = this.editors[0];
    } else {
      this.view = new TabPanel();
      this.editors.forEach((e, i) => this.view.addTab(this.names[i] || 'Script', e));
    }
  }

  /** The sources as they are in the editors, in order. */
  get texts() { return this.editors.map((e) => e.text); }

  /** True when any source differs from the one last compiled. */
  get changed() { return this.texts.some((t, i) => t !== this.compiledSources[i]); }

  /**
   * Compiles the edited sources with runner.recompile(texts) (a
   * ProgramRunner or ProgramSetRunner); the sources it then runs become the
   * compiled ones. Returns the recompile() result.
   */
  compileWith(runner) {
    const result = runner.recompile(this.texts);
    if (result?.sources) this.compiledSources = result.sources.map(String);
    this._onChange?.(this);
    return result;
  }
}
