// SourceWindow: a read-only view of the source a launch window runs, opened
// by its Show source button. One script is shown in a code editor; several
// (a project's) each get a tab, in the order they run.

import { Window } from './window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { TabPanel } from '../widgets/tab-panel.js';

export class SourceWindow extends Window {
  /**
   * @param {object} options - Window options, plus
   * @param {string} [options.title] - what is shown: the launch window's title
   * @param {{name: string, source: string}[]} options.scripts - the scripts, in order
   */
  constructor({ title = '', scripts = [], ...options } = {}) {
    super({
      width: 520, height: 440, minWidth: 280, minHeight: 180,
      ...options,
      title: `Source: ${title || 'Program'}`,
    });
    this.element.classList.add('cr-source-window');
    this.scripts = scripts.map((s) => ({ name: String(s.name ?? ''), source: String(s.source ?? '') }));
    const editor = (script) => new MonacoPanel({ text: script.source, readOnly: true, language: 'python' });
    if (this.scripts.length === 1) {
      this.content = editor(this.scripts[0]);
    } else {
      this.tabs = new TabPanel();
      for (const script of this.scripts) this.tabs.addTab(script.name || 'Script', editor(script));
      this.content = this.tabs;
    }
    this.buttonBar.addButton('Close', () => this.close());
  }
}
