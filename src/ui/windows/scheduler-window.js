// SchedulerWindow: the singleton window listing the programs on the UI's
// scheduler, with buttons to suspend, resume or kill the selected one.

import { Window } from './window.js';
import { ListPanel } from '../widgets/list-panel.js';
import { scheduler as sharedScheduler } from '../runtime.js';

const REFRESH_MS = 250;
let instance = null;

export class SchedulerWindow extends Window {
  /** The single SchedulerWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new SchedulerWindow();
    return instance;
  }

  constructor({ scheduler = sharedScheduler } = {}) {
    if (instance) throw new Error('SchedulerWindow is a singleton; use SchedulerWindow.instance');
    super({ title: 'Process', x: 440, y: 400, width: 420, height: 220 });
    instance = this;
    this.scheduler = scheduler;
    this.element.classList.add('cr-scheduler-window');
    this.listPanel = new ListPanel({ emptyText: 'No running processes' });
    this.content = this.listPanel;
    this.suspendButton = this.buttonBar.addButton('Suspend', () => this.toggleSuspend());
    this.killButton = this.buttonBar.addButton('Kill', () => this.killSelected());
    this.listPanel.element.addEventListener('select', () => this.updateButtons());
    this.timer = null;
    this.refresh();
  }

  /** The Process whose row is selected, or null. */
  get selectedProcess() {
    const pid = this.listPanel.selectedItem?.value;
    return pid === undefined ? null : this.scheduler.get(pid) ?? null;
  }

  /** Rebuilds the list from the scheduler, keeping the selection. */
  refresh() {
    this.listPanel.items = this.scheduler.list().map((p) => ({
      value: p.pid,
      label: `${String(p.pid).padStart(4)}  ${p.name.padEnd(14).slice(0, 14)}  `
        + `${p.state.padEnd(9)}  ${p.vm.steps} steps`,
    }));
    this.updateButtons();
  }

  updateButtons() {
    const process = this.selectedProcess;
    const suspended = process?.state === 'suspended';
    this.suspendButton.label = suspended ? 'Resume' : 'Suspend';
    this.suspendButton.enabled = Boolean(process);
    this.killButton.enabled = Boolean(process);
    this.buttonBar.layout();
  }

  toggleSuspend() {
    const process = this.selectedProcess;
    if (!process) return;
    if (process.state === 'suspended') {
      this.scheduler.resume(process.pid);
      this.scheduler.start();
    } else {
      this.scheduler.suspend(process.pid);
      this.scheduler.wake?.();   // let a sleeping loop notice it may be done
    }
    this.refresh();
  }

  killSelected() {
    const process = this.selectedProcess;
    if (!process) return;
    this.scheduler.kill(process.pid);
    this.scheduler.wake?.();
    this.refresh();
  }

  /** Opens the window and refreshes the list while it is open. */
  open(viewport) {
    super.open(viewport);
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.refresh(), REFRESH_MS);
    return this;
  }

  close() {
    const closed = super.close();
    if (closed) this._stopTimer();
    return closed;
  }

  dispose() {
    this._stopTimer();
    super.dispose();
    instance = null;
  }

  _stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
