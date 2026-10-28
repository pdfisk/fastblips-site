// WidgetHelpWindow: the singleton window, opened by Help > Widget
// Documentation, that documents every widget a program can make. A list of
// entries on the left - All widgets, Common methods, then one per class - and
// the text of the one chosen on the right. The text is made from the class
// table (../widget-docs.js), so it follows the widgets as they change.

import { HSplitWindow } from './hsplit-window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { TextPanel } from '../widgets/text-panel.js';
import { helpEntries } from '../widget-docs.js';

let instance = null;

export class WidgetHelpWindow extends HSplitWindow {
  /** The single WidgetHelpWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new WidgetHelpWindow();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('WidgetHelpWindow is a singleton; use WidgetHelpWindow.instance');
    const listPanel = new ListPanel();
    const textPanel = new TextPanel({ readOnly: true });
    super({
      title: 'Widget Documentation', x: 60, y: 60, width: 780, height: 520, left: listPanel, right: textPanel, position: 0.22,
    });
    instance = this;
    this.element.classList.add('cr-widget-help-window');
    this.listPanel = listPanel;
    this.textPanel = textPanel;
    this.entries = helpEntries();
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

  /** Chooses the entry with this label ('Image', 'Common methods', ...); false when there is none. */
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
