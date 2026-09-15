// Application start-up: builds the initial widget tree.

import { Viewport } from './viewport.js';
import { TranscriptWindow } from './transcript-window.js';

export function start() {
  const viewport = Viewport.instance.mount(document.body);
  TranscriptWindow.instance.open(viewport);
  return viewport;
}
