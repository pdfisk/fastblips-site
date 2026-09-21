// StatusBar: the singleton strip docked along the bottom of the Viewport
// (see docs/widgets.txt). A subclass of HPanel with two Labels: a message on
// the left and an info area (e.g. the scheduler summary) on the right.

import { HPanel } from './hpanel.js';
import { Label } from './label.js';
import { Button } from './button.js';

let instance = null;

export const STATUS_BAR_HEIGHT = 24;

export class StatusBar extends HPanel {
  /** The single StatusBar, created on first use. */
  static get instance() {
    if (!instance) instance = new StatusBar();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('StatusBar is a singleton; use StatusBar.instance');
    super({ padding: 2, spacing: 6 });
    instance = this;
    this.height = STATUS_BAR_HEIGHT;
    this.element.classList.add('cr-status-bar');
    this.element.setAttribute('role', 'status');
    this.element.style.cssText += ';background:#e9ecef;border-top:1px solid #c5cbd3;'
      + 'font:12px system-ui,sans-serif;z-index:100000;box-sizing:border-box';

    this.messageLabel = new Label('Ready');
    this.messageLabel.flex = 1;
    this.infoLabel = new Label('');
    this.taskButtons = [];
    this.add(this.messageLabel);
    this.add(this.infoLabel);
  }

  /**
   * Replaces the task buttons shown between the message and the info, e.g.
   * one per minimized window.
   * @param {{label: string, title?: string, action: () => void}[]} tasks
   */
  setTasks(tasks) {
    for (const button of this.taskButtons) this.remove(button);
    this.remove(this.infoLabel);
    this.taskButtons = tasks.map((task) => {
      const button = new Button(task.label, task.action);
      button.element.classList.add('cr-status-task');
      button.element.title = task.title ?? task.label;
      button.element.style.cssText += ';max-width:180px;overflow:hidden;text-overflow:ellipsis;'
        + 'border:1px solid #b8c0ca;background:#f8f9fa;padding:0 8px;font-size:12px';
      const natural = button.preferredWidth.bind(button);
      button.preferredWidth = () => Math.min(180, natural() + 4);   // slack for sub-pixel text
      return button;
    });
    for (const button of this.taskButtons) this.add(button);
    this.add(this.infoLabel);
    this.layout();
  }

  /** The message on the left. Setting it resets the tone to normal. */
  get message() { return this.messageLabel.text; }
  set message(text) { this.show(text); }

  /** Sets the message; tone 'error' shows it in red. */
  show(text, tone = 'normal') {
    this.messageLabel.text = text;
    this.messageLabel.tone = tone;
  }

  /** The text on the right. */
  get info() { return this.infoLabel.text; }
  set info(text) {
    if (text === this.infoLabel.text) return;
    this.infoLabel.text = text;
    this.layout();
  }

  dispose() {
    super.dispose();
    instance = null;
  }
}
