// The one Scheduler the browser UI runs programs on. Every ConsoleWindow
// spawns into it and the SchedulerWindow shows and controls it.

import { Scheduler } from '../scheduling/scheduler.js';

export const scheduler = new Scheduler({ quantum: 1000 });
