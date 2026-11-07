import { isProposalStale, supersedePriorProposals } from '../replanVersioning';
import type { PlanVersion } from '../types';

function makePlan(overrides: Partial<PlanVersion>): PlanVersion {
  return {
    id: 'p1',
    version: 1,
    date: '2026-10-07',
    status: 'proposed',
    blocks: [],
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: '2026-10-07T09:00:00.000Z',
    ...overrides,
  };
}

describe('supersedePriorProposals', () => {
  it('discards an older pending proposal for the same date when a newer one replaces it', () => {
    const oldProposal = makePlan({ id: 'v2', version: 2, status: 'proposed' });
    const accepted = makePlan({ id: 'v1', version: 1, status: 'accepted' });
    const newProposal = makePlan({ id: 'v3', version: 3, status: 'proposed' });

    const { updated, superseded } = supersedePriorProposals([accepted, oldProposal], newProposal);

    expect(superseded.map((v) => v.id)).toEqual(['v2']);
    expect(updated.find((v) => v.id === 'v2')?.status).toBe('discarded');
    expect(updated.find((v) => v.id === 'v1')?.status).toBe('accepted'); // untouched
  });

  it('does not touch a proposed plan from a different date', () => {
    const otherDayProposal = makePlan({ id: 'v9', date: '2026-10-06', status: 'proposed' });
    const newProposal = makePlan({ id: 'v3', date: '2026-10-07', status: 'proposed' });

    const { updated, superseded } = supersedePriorProposals([otherDayProposal], newProposal);

    expect(superseded).toHaveLength(0);
    expect(updated.find((v) => v.id === 'v9')?.status).toBe('proposed');
  });

  it('is a no-op when there is no prior pending proposal', () => {
    const accepted = makePlan({ id: 'v1', status: 'accepted' });
    const newProposal = makePlan({ id: 'v2', status: 'proposed' });

    const { updated, superseded } = supersedePriorProposals([accepted], newProposal);

    expect(superseded).toHaveLength(0);
    expect(updated).toEqual([accepted]);
  });

  it('handles several stacked pending proposals by discarding all but the newest', () => {
    const v2 = makePlan({ id: 'v2', version: 2, status: 'proposed' });
    const v3 = makePlan({ id: 'v3', version: 3, status: 'proposed' });
    const v4 = makePlan({ id: 'v4', version: 4, status: 'proposed' });

    const { superseded } = supersedePriorProposals([v2, v3], v4);
    expect(superseded.map((v) => v.id).sort()).toEqual(['v2', 'v3']);
  });
});

describe('supersedePriorProposals — works for the new edit-triggered event types too', () => {
  it('supersedes a pending preferences_changed proposal when a newer task_edited one for the same date arrives', () => {
    const oldProposal = makePlan({
      id: 'v2',
      version: 2,
      status: 'proposed',
      triggeredBy: { type: 'preferences_changed', summary: 'Updated sleep window.', reportedAt: '2026-10-07T09:00:00.000Z' },
    });
    const newProposal = makePlan({
      id: 'v3',
      version: 3,
      status: 'proposed',
      triggeredBy: { type: 'task_edited', taskId: 'task-1', summary: 'Edited a task.', reportedAt: '2026-10-07T09:05:00.000Z' },
    });

    const { updated, superseded } = supersedePriorProposals([oldProposal, newProposal], newProposal);

    expect(superseded.map((v) => v.id)).toEqual(['v2']);
    expect(updated.find((v) => v.id === 'v2')?.status).toBe('discarded');
    expect(updated.find((v) => v.id === 'v3')?.triggeredBy?.type).toBe('task_edited');
  });
});

describe('isProposalStale', () => {
  it('is false when the expected id matches the current proposed plan', () => {
    const plan = makePlan({ id: 'v3' });
    expect(isProposalStale('v3', plan)).toBe(false);
  });

  it('is true when a newer proposal has replaced the one the screen was showing', () => {
    const plan = makePlan({ id: 'v4' });
    expect(isProposalStale('v3', plan)).toBe(true);
  });

  it('is true when there is no current proposal at all (already accepted/discarded elsewhere)', () => {
    expect(isProposalStale('v3', null)).toBe(true);
  });

  it('is false for a current preferences_changed proposal whose id matches', () => {
    const plan = makePlan({
      id: 'v3',
      triggeredBy: { type: 'preferences_changed', summary: 'Updated sleep window.', reportedAt: '2026-10-07T09:00:00.000Z' },
    });
    expect(isProposalStale('v3', plan)).toBe(false);
  });
});
