// The one Scheduler the browser UI runs programs on. Every BasicConsoleWindow
// and PythonConsoleWindow spawns into it - Crumb and MiniPy chunks run on the
// same VM - and the SchedulerWindow shows and controls it.

import { Scheduler } from '../scheduling/scheduler.js';

export const scheduler = new Scheduler({ quantum: 1000 });
