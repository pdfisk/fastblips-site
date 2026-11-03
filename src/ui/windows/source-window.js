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
    this.content = sourceView(this.scripts);
    if (this.content instanceof TabPanel) this.tabs = this.content;
    this.buttonBar.addButton('Close', () => this.close());
  }
}

/**
 * A read-only view of scripts ({name, source}, in order): a code editor for
 * one script, or a TabPanel with one editor per script. Used by SourceWindow
 * and by MobileLaunchWindow, which shows it in place of the output.
 */
export function sourceView(scripts) {
  const editor = (script) => new MonacoPanel({ text: String(script.source ?? ''), readOnly: true, language: 'python' });
  if (scripts.length === 1) return editor(scripts[0]);
  const tabs = new TabPanel();
  for (const script of scripts) tabs.addTab(String(script.name ?? '') || 'Script', editor(script));
  return tabs;
}
