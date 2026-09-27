import type { PlanBlock, Task } from './types';
import { addMinutesToISO, durationMinutes, type Interval } from './time';

export interface AllocateInput {
  /** Free intervals available for scheduling, chronological or not. */
  gaps: Interval[];
  /** Tasks in the order they should be considered (most important first). */
  tasks: Task[];
  /** Windows the user prefers for focused work; used as a soft placement preference. */
  preferredFocusBlocks: Interval[];
  breakEveryMinutes?: number;
  breakMinutes?: number;
  idGen: () => string;
}

export interface AllocateResult {
  blocks: PlanBlock[];
  unplaced: Task[];
}

interface Candidate {
  freeIndex: number;
  start: string;
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Greedily bin-packs tasks into a free-interval list, earliest-fit by
 * default but preferring a slot inside the user's preferred focus windows
 * when one is available. Splits free intervals around each placement so
 * unused time on either side stays available for later, lower-priority
 * tasks. Inserts a short break after a contiguous stretch of focus work.
 */
export function allocateTasksToGaps(input: AllocateInput): AllocateResult {
  const breakEveryMinutes = input.breakEveryMinutes ?? 90;
  const breakMinutes = input.breakMinutes ?? 10;

  let freeList: Interval[] = [...input.gaps].filter((g) => durationMinutes(g) > 0);
  const blocks: PlanBlock[] = [];
  const unplaced: Task[] = [];

  let lastPlacedEnd: string | null = null;
  let sinceBreakMinutes = 0;

  const placeInterval = (freeIndex: number, start: string, end: string) => {
    const f = freeList[freeIndex];
    const remainder: Interval[] = [];
    if (ms(f.start) < ms(start)) remainder.push({ start: f.start, end: start });
    if (ms(end) < ms(f.end)) remainder.push({ start: end, end: f.end });
    freeList = [...freeList.slice(0, freeIndex), ...freeList.slice(freeIndex + 1), ...remainder];
  };

  for (const task of input.tasks) {
    let bestPlain: Candidate | null = null;
    let bestPreferred: Candidate | null = null;

    for (let i = 0; i < freeList.length; i++) {
      const f = freeList[i];
      if (durationMinutes(f) < task.estimateMinutes) continue;

      if (bestPlain === null || ms(f.start) < ms(bestPlain.start)) {
        bestPlain = { freeIndex: i, start: f.start };
      }

      for (const w of input.preferredFocusBlocks) {
        const candidateStart = ms(f.start) > ms(w.start) ? f.start : w.start;
        const candidateEnd = addMinutesToISO(candidateStart, task.estimateMinutes);
        if (ms(candidateEnd) <= ms(f.end) && ms(candidateEnd) <= ms(w.end) && ms(candidateStart) >= ms(f.start)) {
          if (bestPreferred === null || ms(candidateStart) < ms(bestPreferred.start)) {
            bestPreferred = { freeIndex: i, start: candidateStart };
          }
        }
      }
    }

    const chosen = bestPreferred ?? bestPlain;
    if (!chosen) {
      unplaced.push(task);
      continue;
    }

    const start = chosen.start;
    const end = addMinutesToISO(start, task.estimateMinutes);
    placeInterval(chosen.freeIndex, start, end);

    const isPreferredPlacement = chosen === bestPreferred;
    blocks.push({
      id: input.idGen(),
      kind: 'task',
      taskId: task.id,
      title: task.title,
      start,
      end,
      flexibility: task.canMove ? 'flexible' : 'fixed',
      reason: isPreferredPlacement
        ? `Scheduled in your preferred focus window (priority: ${task.priority}).`
        : `Scheduled in the next available slot (priority: ${task.priority}).`,
    });

    sinceBreakMinutes = lastPlacedEnd === start ? sinceBreakMinutes + task.estimateMinutes : task.estimateMinutes;
    lastPlacedEnd = end;

    if (sinceBreakMinutes >= breakEveryMinutes) {
      const adjacentIndex = freeList.findIndex((f) => f.start === end);
      if (adjacentIndex !== -1 && durationMinutes(freeList[adjacentIndex]) >= breakMinutes) {
        const breakEnd = addMinutesToISO(end, breakMinutes);
        blocks.push({
          id: input.idGen(),
          kind: 'break',
          title: 'Break',
          start: end,
          end: breakEnd,
          flexibility: 'flexible',
          reason: `Short break after ${sinceBreakMinutes} minutes of focus work.`,
        });
        placeInterval(adjacentIndex, end, breakEnd);
        lastPlacedEnd = breakEnd;
      }
      sinceBreakMinutes = 0;
    }
  }

  return { blocks, unplaced };
}
