// Single entry point for the browser bundle: everything the page needs,
// hung off one global (window.Crumb).

import { parse, compile, run } from '../index.js';
import { disassemble } from '../vm/disasm.js';
import { formatAst, formatTokens } from '../vm/format.js';
import { formatDiagnostics } from '../vm/diagnostics.js';
import { tokenize } from '../vm/lexer.js';
import { KEYWORDS, BUILTINS } from '../vm/tokens.js';
import { Widget } from './widgets/widget.js';
import { Panel } from './widgets/panel.js';
import { Viewport } from './widgets/viewport.js';
import { HPanel } from './widgets/hpanel.js';
import { Menu } from './widgets/menu.js';
import { Navbar } from './widgets/navbar.js';
import { Window } from './windows/window.js';
import { TextPanel } from './widgets/text-panel.js';
import { TranscriptWindow } from './windows/transcript-window.js';
import { start } from './app.js';

const ui = {
  Widget, Panel, Viewport, HPanel, Navbar, Menu, Window, TextPanel,
  TranscriptWindow, start,
};

export {
  parse, compile, run, disassemble, formatAst, formatTokens,
  formatDiagnostics, tokenize, KEYWORDS, BUILTINS, ui,
};
