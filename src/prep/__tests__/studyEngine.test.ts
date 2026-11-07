import { selectDailyPracticeSet, topicsNeedingPractice } from '../studyEngine';
import type { QuestionAttempt, StudyQuestion } from '../types';

const NOW = '2026-10-07T09:00:00.000Z';

function q(id: string, topic: string, createdAt = '2026-09-01T00:00:00.000Z'): StudyQuestion {
  return { id, noteId: 'n1', topic, question: `Q ${id}`, answer: `A ${id}`, createdAt };
}

function attempt(questionId: string, confidence: QuestionAttempt['confidence'], attemptedAt: string): QuestionAttempt {
  return { id: `${questionId}-${attemptedAt}`, questionId, confidence, attemptedAt };
}

describe('selectDailyPracticeSet', () => {
  it('prioritizes never-attempted questions over any attempted ones', () => {
    const never = q('never', 'topics');
    const highConfidence = q('high', 'topics');
    const attempts = [attempt('high', 'high', '2026-10-06T09:00:00.000Z')];

    const set = selectDailyPracticeSet([highConfidence, never], attempts, NOW, 2);
    expect(set[0].id).toBe('never');
  });

  it('prioritizes low confidence over medium and high', () => {
    const low = q('low', 't');
    const medium = q('medium', 't');
    const high = q('high', 't');
    const attempts = [
      attempt('low', 'low', '2026-10-06T09:00:00.000Z'),
      attempt('medium', 'medium', '2026-10-06T09:00:00.000Z'),
      attempt('high', 'high', '2026-10-06T09:00:00.000Z'),
    ];

    const set = selectDailyPracticeSet([high, medium, low], attempts, NOW, 3);
    expect(set.map((s) => s.id)).toEqual(['low', 'medium', 'high']);
  });

  it('within the same confidence tier, practices the longest-overdue question first', () => {
    const recentlyPracticed = q('recent', 't');
    const longAgoPracticed = q('longago', 't');
    const attempts = [
      attempt('recent', 'medium', '2026-10-07T08:00:00.000Z'), // 1 hour before NOW
      attempt('longago', 'medium', '2026-09-01T08:00:00.000Z'), // over a month before NOW
    ];

    const set = selectDailyPracticeSet([recentlyPracticed, longAgoPracticed], attempts, NOW, 2);
    expect(set.map((s) => s.id)).toEqual(['longago', 'recent']);
  });

  it('is deterministic across repeated calls with identical input', () => {
    const questions = [q('a', 't1'), q('b', 't2'), q('c', 't1')];
    const attempts = [attempt('a', 'low', '2026-10-05T00:00:00.000Z')];

    const first = selectDailyPracticeSet(questions, attempts, NOW, 3).map((s) => s.id);
    const second = selectDailyPracticeSet(questions, attempts, NOW, 3).map((s) => s.id);
    expect(first).toEqual(second);
  });

  it('caps the set at the requested count', () => {
    const questions = [q('a', 't'), q('b', 't'), q('c', 't')];
    const set = selectDailyPracticeSet(questions, [], NOW, 2);
    expect(set).toHaveLength(2);
  });
});

describe('topicsNeedingPractice', () => {
  it('includes topics with a never-attempted question', () => {
    const topics = topicsNeedingPractice([q('a', 'behavioral')], []);
    expect(topics).toContain('behavioral');
  });

  it('includes topics whose most recent attempt was low confidence', () => {
    const topics = topicsNeedingPractice(
      [q('a', 'system-design')],
      [attempt('a', 'low', '2026-10-06T00:00:00.000Z')]
    );
    expect(topics).toContain('system-design');
  });

  it('excludes topics where the most recent attempt was medium or high confidence', () => {
    const topics = topicsNeedingPractice(
      [q('a', 'sql')],
      [
        attempt('a', 'low', '2026-10-01T00:00:00.000Z'),
        attempt('a', 'high', '2026-10-06T00:00:00.000Z'), // most recent overrides the earlier low
      ]
    );
    expect(topics).not.toContain('sql');
  });
});
