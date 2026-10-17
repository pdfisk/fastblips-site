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
import { VSplitPanel } from './widgets/vsplit-panel.js';
import { VPanel } from './widgets/vpanel.js';
import { ProgramWidgetHost } from './program-widgets.js';
import { DesignerWindow } from './windows/designer-window.js';
import { Window } from './windows/window.js';
import { HSplitWindow } from './windows/hsplit-window.js';
import { ConsoleWindow } from './windows/console-window.js';
import { BasicConsoleWindow } from './windows/basic-console-window.js';
import { PythonConsoleWindow } from './windows/python-console-window.js';
import { TextPanel } from './widgets/text-panel.js';
import { MonacoPanel } from './widgets/monaco-panel.js';
import { ListPanel } from './widgets/list-panel.js';
import { GridPanel } from './widgets/grid-panel.js';
import { SchedulerWindow } from './windows/scheduler-window.js';
import { CommunityProjectsWindow } from './windows/community-projects-window.js';
import { scheduler } from './runtime.js';
import { TranscriptWindow } from './windows/transcript-window.js';
import { DatabaseWindow, BasicDatabaseWindow, PythonDatabaseWindow } from './windows/database-window.js';
import { RecordPanel } from './widgets/record-panel.js';
import { ProjectsWindow } from './windows/projects-window.js';
import { ProjectPanel } from './widgets/project-panel.js';
import { Separator } from './widgets/separator.js';
import { ScriptEditWindow } from './windows/script-edit-window.js';
import { ScriptPickerWindow } from './windows/script-picker-window.js';
import { TabPanel } from './widgets/tab-panel.js';
import { OutputPanel } from './widgets/output-panel.js';
import { BoardPanel } from './widgets/board-panel.js';
import { CanvasPanel } from './widgets/canvas-panel.js';
import { PhysicsPanel } from './widgets/physics-panel.js';
import { LaunchWindow, DesktopLaunchWindow, MobileLaunchWindow } from './windows/launch-window.js';
import { Label } from './widgets/label.js';
import * as db from './db-client.js';
import { start, startDesktop } from './app.js';
import { startMobile } from './mobile/app.js';
import { startRuntime, findProgram, startProjectRuntime, findProject } from './run-app.js';
import { ProgramRunner } from './program-runner.js';
import { AppScreen } from './widgets/app-screen.js';
import { isMobileDevice } from './device.js';
import { THEMES, setTheme, themeName, resolvedTheme } from './theme.js';
import { CODE_FONTS, setCodeFont, codeFontName } from './fonts.js';

const ui = {
  Widget, Panel, Viewport, HPanel, VPanel, Navbar, Menu, Button, ButtonBar, Spacer, Separator,
  SplitPanel, HSplitPanel, VSplitPanel, TextPanel, MonacoPanel, ListPanel, GridPanel,
  Window, HSplitWindow, ConsoleWindow, BasicConsoleWindow, PythonConsoleWindow,
  TranscriptWindow, SchedulerWindow, CommunityProjectsWindow, RecordPanel, Label,
  TabPanel, OutputPanel, BoardPanel, CanvasPanel, PhysicsPanel,
  LaunchWindow, DesktopLaunchWindow, MobileLaunchWindow,
  DatabaseWindow, BasicDatabaseWindow, PythonDatabaseWindow, ProjectsWindow, ProjectPanel, ScriptPickerWindow, ScriptEditWindow,
  scheduler, db, start, startDesktop, startMobile, startRuntime, findProgram, startProjectRuntime, findProject,
  ProgramRunner, AppScreen, ProgramWidgetHost, DesignerWindow, isMobileDevice,
  THEMES, setTheme, themeName, resolvedTheme, CODE_FONTS, setCodeFont, codeFontName,
};

export {
  parse, compile, run, disassemble, formatAst, formatTokens,
  formatDiagnostics, tokenize, KEYWORDS, BUILTINS, python, ui,
};
