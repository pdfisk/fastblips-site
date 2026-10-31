// PythonHelpWindow: the singleton window, opened by Help > Python
// Documentation, that documents the Python FastBlips runs. A list of
// sections on the left - Getting started, Values and operators, ... - and the
// text of the one chosen on the right. The text is in ../python-docs.js, where
// tests keep it true to the language.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { TextPanel } from '../widgets/text-panel.js';
import { pythonHelpEntries } from '../python-docs.js';

let instance = null;

export class PythonHelpWindow extends HSplitWindow {
  /** The single PythonHelpWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new PythonHelpWindow();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('PythonHelpWindow is a singleton; use PythonHelpWindow.instance');
    const listPanel = new ListPanel();
    const textPanel = new TextPanel({ readOnly: true });
    super({
      title: 'Python Documentation', x: 80, y: 50, width: 800, height: 540, left: listPanel, right: textPanel, position: 0.24,
    });
    instance = this;
    this.element.classList.add('cr-python-help-window');
    this.listPanel = listPanel;
    this.textPanel = textPanel;
    this.entries = pythonHelpEntries();
    listPanel.items = this.entries.map((entry, index) => ({ label: entry.label, value: index }));
    listPanel.element.addEventListener('select', () => this.showSelected());
    listPanel.select(0);
  }

  /** The entry chosen in the list. */
  get selectedEntry() {
    const index = this.listPanel.selectedItem?.value;
    return index === undefined ? null : this.entries[index];
  }

  /** Shows the text of the entry chosen in the list, from its top. */
  showSelected() {
    const entry = this.selectedEntry;
    if (!entry) return;
    this.textPanel.text = entry.text;
    this.textPanel.textArea.scrollTop = 0;
  }

  /** Chooses the entry with this label ('Strings', 'Not supported', ...); false when there is none. */
  show(label) {
    const index = this.entries.findIndex((entry) => entry.label === label);
    if (index < 0) return false;
    this.listPanel.select(index);
    return true;
  }

  dispose() {
    super.dispose();
    instance = null;
  }
}
