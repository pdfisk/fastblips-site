// The one Scheduler the browser UI runs programs on. Every BasicConsoleWindow
// and PythonConsoleWindow spawns into it - Crumb and MiniPy chunks run on the
// same VM - and the SchedulerWindow shows and controls it.
//
// It uses the Scheduler's defaults: a quantum of 10 instructions per turn,
// and priorities 1 (highest) to 5 (lowest).

import { Scheduler } from '../scheduling/scheduler.js';

export const scheduler = new Scheduler();
