import type { PlanBlock, PlanVersion, Task } from '../../planning/types';
import { createSampleTasks, findMissingSampleTasks } from '../sampleData';

function makeBlock(taskId: string | undefined): PlanBlock {
  return {
    id: `block-${taskId ?? 'none'}`,
    kind: taskId ? 'task' : 'meal',
    taskId,
    title: 'irrelevant',
    start: '2026-09-29T18:00:00.000Z',
    end: '2026-09-29T19:00:00.000Z',
    flexibility: 'flexible',
    reason: '',
  };
}

function makePlan(blocks: PlanBlock[]): PlanVersion {
  return {
    id: `plan-${Math.random()}`,
    version: 1,
    date: '2026-09-29',
    status: 'accepted',
    blocks,
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: '2026-09-29T10:00:00.000Z',
  };
}

describe('findMissingSampleTasks', () => {
  it('finds every sample task a plan references that is missing from tasks', () => {
    // The exact historical bug: the plan's blocks reference all three sample
    // task ids, but a lost update during seeding only persisted one.
    const plan = makePlan([
      makeBlock('task-interview-prep'),
      makeBlock('task-portfolio-work'),
      makeBlock('task-study-ds'),
    ]);
    const tasks: Task[] = [createSampleTasks().find((t) => t.id === 'task-study-ds')!];

    const missing = findMissingSampleTasks(tasks, [plan]);

    expect(missing.map((t) => t.id).sort()).toEqual(['task-interview-prep', 'task-portfolio-work']);
  });

  it('returns nothing once all referenced sample tasks already exist (idempotent)', () => {
    const plan = makePlan([
      makeBlock('task-interview-prep'),
      makeBlock('task-portfolio-work'),
      makeBlock('task-study-ds'),
    ]);
    const tasks = createSampleTasks();

    expect(findMissingSampleTasks(tasks, [plan])).toEqual([]);
  });

  it('never fabricates a task for a dangling reference that is not a known sample task', () => {
    // A real, unrelated dangling reference (not from the sample-data bug) must
    // not be silently "fixed" by inventing a task — that would hide a
    // different problem, not this one.
    const plan = makePlan([makeBlock('task-some-other-thing')]);

    expect(findMissingSampleTasks([], [plan])).toEqual([]);
  });

  it('ignores blocks with no taskId and plans with no blocks', () => {
    const plan = makePlan([makeBlock(undefined)]);

    expect(findMissingSampleTasks([], [plan])).toEqual([]);
    expect(findMissingSampleTasks([], [])).toEqual([]);
  });

  it('never treats a real user task as a sample task, even by coincidence of being unlisted', () => {
    // A real task's id always comes from generateId('task'), never a static
    // sample id, so it can never collide with the sample id set — but this
    // pins down that a dangling reference to some other real-looking id still
    // isn't "fixed" by fabricating a task for it.
    const plan = makePlan([makeBlock('task-1700000000000-abcd1234')]);

    expect(findMissingSampleTasks([], [plan])).toEqual([]);
  });
});
