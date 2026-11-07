import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanVersion, Task } from '../../planning/types';
import type { StudyQuestion } from '../../prep/types';
import { createAsyncStorageRepositories } from '../asyncStorageRepositories';

// Jest hoists this above the imports above at compile time (babel-plugin-jest-hoist);
// the inline require is required by that same hoisting — a factory can't close over
// an outer import binding, only over `require(...)` calls and `mock`-prefixed names.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    estimateMinutes: 60,
    priority: 'medium',
    canMove: true,
    status: 'unscheduled',
    createdAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('AsyncStorageTaskRepository — concurrent writes to the same key', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists every task from concurrent create() calls, not just the last writer', async () => {
    // This is the exact shape of the historical bug: onboarding seeding fired
    // Promise.all(sampleTasks.map(t => repos.tasks.create(t))) against a single
    // AsyncStorage key. Each create() did an unlocked read-modify-write, so all
    // three reads saw the same empty snapshot and the last write clobbered the
    // other two — only one of three sample tasks ever survived.
    const repos = createAsyncStorageRepositories();
    const tasks = [makeTask('task-interview-prep'), makeTask('task-portfolio-work'), makeTask('task-study-ds')];

    await Promise.all(tasks.map((t) => repos.tasks.create(t)));

    const persisted = await repos.tasks.list();
    expect(persisted.map((t) => t.id).sort()).toEqual(
      ['task-interview-prep', 'task-portfolio-work', 'task-study-ds'].sort()
    );
  });

  it('applies every patch from concurrent update() calls, not just the last writer', async () => {
    // The same race exists in update() — e.g. AppStateContext.persistTaskStatuses
    // fires one Promise.all(update) per task when a plan with several scheduled
    // tasks is accepted (including the onboarding sample scenario itself).
    const repos = createAsyncStorageRepositories();
    const ids = ['task-a', 'task-b', 'task-c'];
    for (const id of ids) {
      await repos.tasks.create(makeTask(id));
    }

    await Promise.all(ids.map((id) => repos.tasks.update(id, { status: 'scheduled' })));

    const persisted = await repos.tasks.list();
    expect(persisted).toHaveLength(3);
    for (const id of ids) {
      expect(persisted.find((t) => t.id === id)?.status).toBe('scheduled');
    }
  });

  it('interleaves concurrent create() and update() calls against the same key correctly', async () => {
    const repos = createAsyncStorageRepositories();
    await repos.tasks.create(makeTask('task-existing', { status: 'unscheduled' }));

    await Promise.all([
      repos.tasks.create(makeTask('task-new-1')),
      repos.tasks.update('task-existing', { status: 'scheduled' }),
      repos.tasks.create(makeTask('task-new-2')),
    ]);

    const persisted = await repos.tasks.list();
    expect(persisted.map((t) => t.id).sort()).toEqual(['task-existing', 'task-new-1', 'task-new-2'].sort());
    expect(persisted.find((t) => t.id === 'task-existing')?.status).toBe('scheduled');
  });
});

function makeQuestion(id: string, noteId: string): StudyQuestion {
  return { id, noteId, topic: 'Topic', question: `Question ${id}`, answer: `Answer ${id}`, createdAt: '2026-09-29T10:00:00.000Z' };
}

describe('AsyncStorageStudyQuestionRepository — concurrent writes to the same key', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes every targeted question from concurrent remove() calls, not just the last writer', async () => {
    // Mirrors the exact real race: PrepStateContext.removeNote fires
    // Promise.all(orphaned.map(q => repos.studyQuestions.remove(q.id))) whenever a
    // deleted note has 2+ attached questions.
    const repos = createAsyncStorageRepositories();
    const questions = [makeQuestion('q1', 'note-1'), makeQuestion('q2', 'note-1'), makeQuestion('q3', 'note-1')];
    for (const q of questions) {
      await repos.studyQuestions.save(q);
    }

    await Promise.all(questions.map((q) => repos.studyQuestions.remove(q.id)));

    const remaining = await repos.studyQuestions.list();
    expect(remaining).toHaveLength(0);
  });

  it('persists every question from concurrent save() calls, not just the last writer', async () => {
    const repos = createAsyncStorageRepositories();
    const questions = [makeQuestion('q1', 'note-1'), makeQuestion('q2', 'note-1'), makeQuestion('q3', 'note-1')];

    await Promise.all(questions.map((q) => repos.studyQuestions.save(q)));

    const persisted = await repos.studyQuestions.list();
    expect(persisted.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3']);
  });
});

function makePlanVersion(id: string, overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    id,
    version: 1,
    date: '2026-09-29',
    status: 'discarded',
    blocks: [],
    unscheduledTasks: [],
    atRiskTasks: [],
    changes: [],
    explanations: [],
    createdAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('AsyncStorageHourlyEntryRepository — concurrent writes to the same key', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists every hour from concurrent upsert() calls to different hours, not just the last writer', async () => {
    const repos = createAsyncStorageRepositories();
    const now = '2026-10-07T10:00:00.000Z';

    await Promise.all([
      repos.hourlyEntries.upsert('2026-10-07', 9, { intention: 'Study' }, now),
      repos.hourlyEntries.upsert('2026-10-07', 10, { intention: 'Gym' }, now),
      repos.hourlyEntries.upsert('2026-10-07', 11, { intention: 'Write' }, now),
    ]);

    const persisted = await repos.hourlyEntries.list();
    expect(persisted.map((e) => e.hour).sort((a, b) => a - b)).toEqual([9, 10, 11]);
  });

  it('merges a late-arriving patch onto the same hour instead of losing the earlier one — the exact race a bare save() would hit', async () => {
    // Mirrors the historical bug this suite already guards against for tasks/
    // questions/plans: two writes racing against one AsyncStorage key, each
    // doing an unlocked read-modify-write, would otherwise have the later one
    // clobber the earlier one's fields instead of merging onto them.
    const repos = createAsyncStorageRepositories();
    const now = '2026-10-07T10:00:00.000Z';

    await Promise.all([
      repos.hourlyEntries.upsert('2026-10-07', 9, { intention: 'Study algorithms' }, now),
      repos.hourlyEntries.upsert('2026-10-07', 9, { pastChoice: 'followed_plan', respondedAt: now }, now),
    ]);

    const persisted = await repos.hourlyEntries.list();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].intention).toBe('Study algorithms');
    expect(persisted[0].pastChoice).toBe('followed_plan');
  });

  it('upserting the same (date, hour) twice never creates a second entry', async () => {
    const repos = createAsyncStorageRepositories();
    const now = '2026-10-07T10:00:00.000Z';
    await repos.hourlyEntries.upsert('2026-10-07', 9, { intention: 'First' }, now);
    await repos.hourlyEntries.upsert('2026-10-07', 9, { intention: 'Corrected' }, '2026-10-07T10:05:00.000Z');

    const persisted = await repos.hourlyEntries.list();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].intention).toBe('Corrected');
    expect(persisted[0].updatedAt).toBe('2026-10-07T10:05:00.000Z');
  });
});

describe('AsyncStoragePlanRepository — concurrent writes to the same key', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists every version from concurrent saveVersion() calls, not just the last writer', async () => {
    // Mirrors a supersede burst: AppStateContext.runReplanOrGenerate calls
    // Promise.all(superseded.map(v => repos.plans.saveVersion(v))) — not currently
    // reachable with more than one element, but this feature adds new entry points
    // into that same function, so the write path is fixed defensively here.
    const repos = createAsyncStorageRepositories();
    const versions = [makePlanVersion('v1'), makePlanVersion('v2'), makePlanVersion('v3')];

    await Promise.all(versions.map((v) => repos.plans.saveVersion(v)));

    const persisted = await repos.plans.listVersions();
    expect(persisted.map((v) => v.id).sort()).toEqual(['v1', 'v2', 'v3']);
  });
});
