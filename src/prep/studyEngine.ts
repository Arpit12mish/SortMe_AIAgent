import type { Confidence, QuestionAttempt, StudyQuestion } from './types';

function confidenceRank(c: Confidence): number {
  return c === 'low' ? 0 : c === 'medium' ? 1 : 2;
}

function lastAttemptFor(questionId: string, attempts: QuestionAttempt[]): QuestionAttempt | undefined {
  return attempts
    .filter((a) => a.questionId === questionId)
    .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())[0];
}

/**
 * Deterministic, non-AI selection of today's practice set: questions never
 * attempted come first, then lowest last-reported confidence, then longest
 * time since last practiced (or since creation, if never practiced) within
 * each tier. No randomness and no model call — same inputs always produce
 * the same set, so it's reproducible and explainable.
 */
export function selectDailyPracticeSet(
  questions: StudyQuestion[],
  attempts: QuestionAttempt[],
  nowIso: string,
  count = 5
): StudyQuestion[] {
  const nowMs = new Date(nowIso).getTime();
  const scored = questions.map((q) => {
    const last = lastAttemptFor(q.id, attempts);
    const tier = last ? confidenceRank(last.confidence) : -1; // never attempted is most urgent
    const sinceMs = nowMs - new Date(last ? last.attemptedAt : q.createdAt).getTime();
    return { q, tier, sinceMs };
  });
  scored.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.sinceMs - a.sinceMs));
  return scored.slice(0, count).map((s) => s.q);
}

/** Topics where the most recent attempt was low-confidence, or nothing has been attempted yet. */
export function topicsNeedingPractice(questions: StudyQuestion[], attempts: QuestionAttempt[]): string[] {
  const topics = new Set<string>();
  for (const q of questions) {
    const last = lastAttemptFor(q.id, attempts);
    if (!last || last.confidence === 'low') topics.add(q.topic);
  }
  return [...topics].sort();
}
