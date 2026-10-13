// ScriptPickerWindow: a small window for choosing one script to add to a
// project (Add in the Projects window). It lists the scripts it is given -
// the user's own and those other users have shared (the owner is shown after
// a script's name) - and calls onPick with the chosen one.

import { Window } from './window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { scriptLabel } from '../projects.js';

export class ScriptPickerWindow extends Window {
  /**
   * @param {object} options
   * @param {object[]} options.scripts - the scripts to choose from (projectScript()s)
   * @param {string} [options.space] - the project's space; other users' scripts show their owner
   * @param {(script: object) => void} options.onPick - called with the chosen script
   */
  constructor({ scripts = [], space = '', onPick = () => {} } = {}) {
    super({ title: 'Add Script', x: 210, y: 140, width: 360, height: 300, minWidth: 260, minHeight: 180 });
    this.element.classList.add('cr-script-picker-window');
    this.scripts = scripts;
    this.onPick = onPick;
    this.list = new ListPanel({
      items: scripts.map((s) => ({ label: scriptLabel(s, space), value: s.id })),
      emptyText: 'No scripts to add: none of yours is left, and no one has shared any',
    });
    this.content = this.list;
    this.addButton = this.buttonBar.addButton('Add', () => this.pick());
    this.buttonBar.addButton('Cancel', () => this.close());

    this.list.element.addEventListener('select', () => this.updateButtons());
    this.list.element.addEventListener('dblclick', () => this.pick());
    this.list.list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.pick(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.updateButtons();
  }

  /** The selected script, or null. */
  get selected() {
    const item = this.list.selectedItem;
    return item ? this.scripts.find((s) => s.id === item.value) ?? null : null;
  }

  /** Adds the selected script, if any, and closes. */
  pick() {
    const script = this.selected;
    if (!script) return false;
    this.close();
    this.onPick(script);
    return true;
  }

  updateButtons() {
    this.addButton.enabled = this.selected !== null;
    this.buttonBar.layout();
  }

  open(viewport) {
    super.open(viewport);
    this.list.list.focus();
    return this;
  }
}
