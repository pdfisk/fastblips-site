// TranscriptWindow: the singleton window that shows the transcript.

import { Window } from './window.js';
import { TextPanel } from '../widgets/text-panel.js';

let instance = null;

export class TranscriptWindow extends Window {
  /** The single TranscriptWindow, created on first use. */
  static get instance() {
    if (!instance) instance = new TranscriptWindow();
    return instance;
  }

  constructor() {
    if (instance) throw new Error('TranscriptWindow is a singleton; use TranscriptWindow.instance');
    super({ title: 'Transcript', x: 35, y: 55, width: 375, height: 275 });
    instance = this;
    this.element.classList.add('cr-transcript-window');
    this.textPanel = new TextPanel();
    this.content = this.textPanel;
  }

  dispose() {
    super.dispose();
    instance = null;
  }
}
