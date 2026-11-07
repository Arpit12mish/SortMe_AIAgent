export const BUFFER_MINUTES = 30;
export const BREAK_EVERY_MINUTES = 90;
export const BREAK_MINUTES = 10;
/** How far a protected block (a meal, or a protected-time preference) may shift, in
 *  minutes, to make room for an urgent task. */
export const PROTECTED_SHIFT_TOLERANCE_MINUTES = 60;
/** A deadline within this many hours of the plan's bedtime counts as "must place today". */
export const URGENT_HORIZON_HOURS = 12;
/** Floor for a rolled-over task's remaining estimate after subtracting logged focus time,
 *  so a task that ran long but was never marked completed still gets a schedulable slot
 *  instead of shrinking to zero. Only applies when some time was actually logged — a task
 *  with no sessions yet keeps its full original estimate, never padded up to this floor. */
export const MIN_ROLLOVER_MINUTES = 15;
