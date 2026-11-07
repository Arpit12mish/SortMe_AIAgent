import type { PlanVersion } from './types';

/**
 * When a new proposal is generated for a date that already has a pending
 * (unreviewed) proposal, the old one must not linger forever with status
 * 'proposed' — that would leave two conflicting "current" proposals in
 * history. It's superseded (marked 'discarded') the moment a newer one
 * takes its place. The plan the new proposal was built from (its
 * `parentVersionId`) is never touched by this — only same-date PROPOSED
 * versions other than the new one are affected.
 */
export function supersedePriorProposals(
  planVersions: PlanVersion[],
  newProposal: PlanVersion
): { updated: PlanVersion[]; superseded: PlanVersion[] } {
  const superseded: PlanVersion[] = [];
  const updated = planVersions.map((v) => {
    if (v.id === newProposal.id) return v;
    if (v.date === newProposal.date && v.status === 'proposed') {
      const discarded: PlanVersion = { ...v, status: 'discarded' };
      superseded.push(discarded);
      return discarded;
    }
    return v;
  });
  return { updated, superseded };
}

/**
 * True when the plan a screen is about to accept/discard is no longer the
 * current proposal (e.g. it was superseded by a newer replan while the
 * review screen was open). Callers should refuse the action and ask the
 * user to re-open the latest proposal rather than silently acting on
 * something stale.
 */
export function isProposalStale(expectedPlanId: string, currentProposedPlan: PlanVersion | null): boolean {
  return currentProposedPlan?.id !== expectedPlanId;
}
