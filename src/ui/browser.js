// Single entry point for the browser bundle: everything the page needs,
// hung off one global (window.Crumb).

import { parse, compile, run } from '../index.js';
import { disassemble } from '../vm/disasm.js';
import * as python from '../vm/compiler/python/loader.js';
import { formatAst, formatTokens } from '../vm/compiler/basic/format.js';
import { formatDiagnostics } from '../vm/compiler/basic/diagnostics.js';
import { tokenize } from '../vm/compiler/basic/lexer.js';
import { KEYWORDS, BUILTINS } from '../vm/compiler/basic/tokens.js';
import { Widget } from './widgets/widget.js';
import { Panel } from './widgets/panel.js';
import { Viewport } from './widgets/viewport.js';
import { HPanel } from './widgets/hpanel.js';
import { Menu } from './widgets/menu.js';
import { Navbar } from './widgets/navbar.js';
import { Button } from './widgets/button.js';
import { ButtonBar } from './widgets/button-bar.js';
import { Spacer } from './widgets/spacer.js';
import { SplitPanel } from './widgets/split-panel.js';
import { HSplitPanel } from './widgets/hsplit-panel.js';
import { Window } from './windows/window.js';
import { HSplitWindow } from './windows/hsplit-window.js';
import { ConsoleWindow } from './windows/console-window.js';
import { BasicConsoleWindow } from './windows/basic-console-window.js';
import { PythonConsoleWindow } from './windows/python-console-window.js';
import { TextPanel } from './widgets/text-panel.js';
import { MonacoPanel } from './widgets/monaco-panel.js';
import { ListPanel } from './widgets/list-panel.js';
import { SchedulerWindow } from './windows/scheduler-window.js';
import { scheduler } from './runtime.js';
import { TranscriptWindow } from './windows/transcript-window.js';
import { DatabaseWindow, BasicDatabaseWindow, PythonDatabaseWindow } from './windows/database-window.js';
import { RecordPanel } from './widgets/record-panel.js';
import { Label } from './widgets/label.js';
import * as db from './db-client.js';
import { start } from './app.js';

const ui = {
  Widget, Panel, Viewport, HPanel, Navbar, Menu, Button, ButtonBar, Spacer,
  SplitPanel, HSplitPanel, TextPanel, MonacoPanel, ListPanel,
  Window, HSplitWindow, ConsoleWindow, BasicConsoleWindow, PythonConsoleWindow,
  TranscriptWindow, SchedulerWindow, RecordPanel, Label,
  DatabaseWindow, BasicDatabaseWindow, PythonDatabaseWindow,
  scheduler, db, start,
};

export {
  parse, compile, run, disassemble, formatAst, formatTokens,
  formatDiagnostics, tokenize, KEYWORDS, BUILTINS, python, ui,
};
