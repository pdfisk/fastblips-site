// Application start-up: builds the initial widget tree.

import { Viewport } from './widgets/viewport.js';
import { Navbar } from './widgets/navbar.js';
import { Menu } from './widgets/menu.js';
import { TranscriptWindow } from './windows/transcript-window.js';

export function start() {
  const viewport = Viewport.instance.mount(document.body);

  const navbar = Navbar.instance;
  const views = new Menu('Views');
  const transcript = TranscriptWindow.instance;
  views.addItem('Transcript', () => transcript.toggle(viewport),
    { checked: () => transcript.isOpen });
  navbar.add(views);
  viewport.navbar = navbar;

  transcript.open(viewport);
  return viewport;
}
