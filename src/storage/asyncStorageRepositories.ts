import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EveningReview, MorningCheckIn } from '../checkins/types';
import type { FocusSession } from '../focus/types';
import type { HabitCheckIn, HabitDefinition } from '../habits/types';
import { hourlyEntryId } from '../hourly/hourlyEngine';
import type { HourlyCheckInSettings, HourlyEntry } from '../hourly/types';
import type { PlanVersion, Preferences, Task } from '../planning/types';
import type { InterviewEntry, Note, QuestionAttempt, StudyQuestion } from '../prep/types';
import type { Milestone, Project } from '../projects/types';
import type { ScheduledReminder } from '../reminders/types';
import type {
  AppRepositories,
  CheckInRepository,
  FocusSessionRepository,
  HabitCheckInRepository,
  HabitRepository,
  HourlyEntryRepository,
  HourlySettingsRepository,
  InterviewRepository,
  MilestoneRepository,
  NoteRepository,
  PlanRepository,
  PreferencesRepository,
  ProjectRepository,
  QuestionAttemptRepository,
  ReminderRepository,
  StudyQuestionRepository,
  TaskRepository,
} from './repository';

const KEYS = {
  preferences: '@sortme/preferences',
  tasks: '@sortme/tasks',
  planVersions: '@sortme/planVersions',
  currentPlanIdByDate: '@sortme/currentPlanIdByDate',
  focusSessions: '@sortme/focusSessions',
  morningCheckIns: '@sortme/morningCheckIns',
  eveningReviews: '@sortme/eveningReviews',
  interviews: '@sortme/interviews',
  notes: '@sortme/notes',
  studyQuestions: '@sortme/studyQuestions',
  questionAttempts: '@sortme/questionAttempts',
  reminders: '@sortme/reminders',
  remindersEnabled: '@sortme/remindersEnabled',
  habits: '@sortme/habits',
  habitCheckIns: '@sortme/habitCheckIns',
  projects: '@sortme/projects',
  milestones: '@sortme/milestones',
  hourlyEntries: '@sortme/hourlyEntries',
  hourlySettings: '@sortme/hourlySettings',
} as const;

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

const keyLocks = new Map<string, Promise<void>>();

/**
 * Serializes read-modify-write critical sections against the same storage key.
 * Every repository method here does readJSON-then-writeJSON with no locking of
 * its own; two calls racing on the same key (e.g. concurrent `create()` calls
 * fired via Promise.all) each read the same stale snapshot and the later write
 * silently clobbers the earlier one — a lost update, not an error. Wrapping a
 * method's critical section in this queues it behind any call already in
 * flight for that key, so each one observes the previous one's committed
 * write. A failed operation still lets the queue advance for the next caller.
 */
function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = keyLocks.get(key) ?? Promise.resolve();
  const result = tail.then(fn, fn);
  keyLocks.set(key, result.then(
    () => undefined,
    () => undefined
  ));
  return result;
}

// Future: replace with a client calling `GET/PUT /preferences`.
class AsyncStoragePreferencesRepository implements PreferencesRepository {
  async get(): Promise<Preferences | null> {
    return readJSON<Preferences | null>(KEYS.preferences, null);
  }

  async save(preferences: Preferences): Promise<void> {
    await writeJSON(KEYS.preferences, preferences);
  }
}

// Future: replace with a client calling `POST/GET/PATCH /tasks`.
class AsyncStorageTaskRepository implements TaskRepository {
  async list(): Promise<Task[]> {
    return readJSON<Task[]>(KEYS.tasks, []);
  }

  async create(task: Task): Promise<void> {
    await withKeyLock(KEYS.tasks, async () => {
      const tasks = await this.list();
      await writeJSON(KEYS.tasks, [...tasks, task]);
    });
  }

  async update(id: string, patch: Partial<Task>): Promise<void> {
    await withKeyLock(KEYS.tasks, async () => {
      const tasks = await this.list();
      const next = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      await writeJSON(KEYS.tasks, next);
    });
  }
}

// Future: replace with a client calling `POST /plans/generate`, `/plans/{id}/replan`,
// `/plans/{id}/accept`, and `GET /plans/today`. Plan versions are append-only here,
// matching the blueprint's requirement to never silently lose history.
class AsyncStoragePlanRepository implements PlanRepository {
  async listVersions(): Promise<PlanVersion[]> {
    return readJSON<PlanVersion[]>(KEYS.planVersions, []);
  }

  async saveVersion(version: PlanVersion): Promise<void> {
    await withKeyLock(KEYS.planVersions, async () => {
      const versions = await this.listVersions();
      const withoutPrevious = versions.filter((v) => v.id !== version.id);
      await writeJSON(KEYS.planVersions, [...withoutPrevious, version]);
    });
  }

  async getCurrentVersionId(date: string): Promise<string | null> {
    const map = await readJSON<Record<string, string>>(KEYS.currentPlanIdByDate, {});
    return map[date] ?? null;
  }

  async setCurrentVersionId(date: string, versionId: string): Promise<void> {
    const map = await readJSON<Record<string, string>>(KEYS.currentPlanIdByDate, {});
    await writeJSON(KEYS.currentPlanIdByDate, { ...map, [date]: versionId });
  }

  async getAllCurrentVersionIds(): Promise<Record<string, string>> {
    return readJSON<Record<string, string>>(KEYS.currentPlanIdByDate, {});
  }
}

// Future: replace with a client calling `GET/POST /focus-sessions`.
class AsyncStorageFocusSessionRepository implements FocusSessionRepository {
  async list(): Promise<FocusSession[]> {
    return readJSON<FocusSession[]>(KEYS.focusSessions, []);
  }

  async save(session: FocusSession): Promise<void> {
    const sessions = await this.list();
    const withoutPrevious = sessions.filter((s) => s.id !== session.id);
    await writeJSON(KEYS.focusSessions, [...withoutPrevious, session]);
  }
}

// Future: replace with a client calling `GET/POST /check-ins/morning|evening`.
class AsyncStorageCheckInRepository implements CheckInRepository {
  async listMorning(): Promise<MorningCheckIn[]> {
    return readJSON<MorningCheckIn[]>(KEYS.morningCheckIns, []);
  }

  async saveMorning(checkIn: MorningCheckIn): Promise<void> {
    const all = await this.listMorning();
    await writeJSON(KEYS.morningCheckIns, [...all.filter((c) => c.id !== checkIn.id), checkIn]);
  }

  async listEvening(): Promise<EveningReview[]> {
    return readJSON<EveningReview[]>(KEYS.eveningReviews, []);
  }

  async saveEvening(review: EveningReview): Promise<void> {
    const all = await this.listEvening();
    await writeJSON(KEYS.eveningReviews, [...all.filter((r) => r.id !== review.id), review]);
  }
}

// Future: replace with a client calling `GET/POST/DELETE /interviews`.
class AsyncStorageInterviewRepository implements InterviewRepository {
  async list(): Promise<InterviewEntry[]> {
    return readJSON<InterviewEntry[]>(KEYS.interviews, []);
  }

  async save(entry: InterviewEntry): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.interviews, [...all.filter((e) => e.id !== entry.id), entry]);
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.interviews, all.filter((e) => e.id !== id));
  }
}

// Future: replace with a client calling `GET/POST/DELETE /notes`.
class AsyncStorageNoteRepository implements NoteRepository {
  async list(): Promise<Note[]> {
    return readJSON<Note[]>(KEYS.notes, []);
  }

  async save(note: Note): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.notes, [...all.filter((n) => n.id !== note.id), note]);
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.notes, all.filter((n) => n.id !== id));
  }
}

// Future: replace with a client calling `GET/POST/DELETE /study-questions`.
class AsyncStorageStudyQuestionRepository implements StudyQuestionRepository {
  async list(): Promise<StudyQuestion[]> {
    return readJSON<StudyQuestion[]>(KEYS.studyQuestions, []);
  }

  async save(question: StudyQuestion): Promise<void> {
    await withKeyLock(KEYS.studyQuestions, async () => {
      const all = await this.list();
      await writeJSON(KEYS.studyQuestions, [...all.filter((q) => q.id !== question.id), question]);
    });
  }

  async remove(id: string): Promise<void> {
    await withKeyLock(KEYS.studyQuestions, async () => {
      const all = await this.list();
      await writeJSON(KEYS.studyQuestions, all.filter((q) => q.id !== id));
    });
  }
}

// Future: replace with a client calling `GET/POST /question-attempts`.
class AsyncStorageQuestionAttemptRepository implements QuestionAttemptRepository {
  async list(): Promise<QuestionAttempt[]> {
    return readJSON<QuestionAttempt[]>(KEYS.questionAttempts, []);
  }

  async save(attempt: QuestionAttempt): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.questionAttempts, [...all, attempt]);
  }
}

// Future: replace with a client calling `GET/POST/DELETE /reminders`.
class AsyncStorageReminderRepository implements ReminderRepository {
  async list(): Promise<ScheduledReminder[]> {
    return readJSON<ScheduledReminder[]>(KEYS.reminders, []);
  }

  async save(reminder: ScheduledReminder): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.reminders, [...all.filter((r) => r.id !== reminder.id), reminder]);
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.reminders, all.filter((r) => r.id !== id));
  }
}

// Future: replace with a client calling `GET/POST /habits`.
class AsyncStorageHabitRepository implements HabitRepository {
  async list(): Promise<HabitDefinition[]> {
    return readJSON<HabitDefinition[]>(KEYS.habits, []);
  }

  async save(habit: HabitDefinition): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.habits, [...all.filter((h) => h.id !== habit.id), habit]);
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const habits = await this.list();
    const orderById = new Map(orderedIds.map((id, i) => [id, i]));
    const next = habits.map((h) => (orderById.has(h.id) ? { ...h, order: orderById.get(h.id)! } : h));
    await writeJSON(KEYS.habits, next);
  }
}

// Future: replace with a client calling `GET/POST/DELETE /habit-check-ins`.
class AsyncStorageHabitCheckInRepository implements HabitCheckInRepository {
  async list(): Promise<HabitCheckIn[]> {
    return readJSON<HabitCheckIn[]>(KEYS.habitCheckIns, []);
  }

  async save(checkIn: HabitCheckIn): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.habitCheckIns, [...all.filter((c) => c.id !== checkIn.id), checkIn]);
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    await writeJSON(KEYS.habitCheckIns, all.filter((c) => c.id !== id));
  }
}

// Future: replace with a client calling `GET/POST /projects`.
class AsyncStorageProjectRepository implements ProjectRepository {
  async list(): Promise<Project[]> {
    return readJSON<Project[]>(KEYS.projects, []);
  }

  async save(project: Project): Promise<void> {
    await withKeyLock(KEYS.projects, async () => {
      const all = await this.list();
      await writeJSON(KEYS.projects, [...all.filter((p) => p.id !== project.id), project]);
    });
  }
}

// Future: replace with a client calling `GET/POST/DELETE /milestones`.
class AsyncStorageMilestoneRepository implements MilestoneRepository {
  async list(): Promise<Milestone[]> {
    return readJSON<Milestone[]>(KEYS.milestones, []);
  }

  async save(milestone: Milestone): Promise<void> {
    await withKeyLock(KEYS.milestones, async () => {
      const all = await this.list();
      await writeJSON(KEYS.milestones, [...all.filter((m) => m.id !== milestone.id), milestone]);
    });
  }

  async remove(id: string): Promise<void> {
    await withKeyLock(KEYS.milestones, async () => {
      const all = await this.list();
      await writeJSON(KEYS.milestones, all.filter((m) => m.id !== id));
    });
  }
}

// Future: replace with a client calling `GET/POST /hourly-entries`. Entries use a
// deterministic id (hourlyEntryId(date, hour)) so this plain by-id upsert, guarded
// by withKeyLock like AsyncStorageProjectRepository, is also what keeps at most one
// entry per hour even under concurrent saves (e.g. setting an intention while a
// check-in answer for the same hour is also being saved).
class AsyncStorageHourlyEntryRepository implements HourlyEntryRepository {
  async list(): Promise<HourlyEntry[]> {
    return readJSON<HourlyEntry[]>(KEYS.hourlyEntries, []);
  }

  async upsert(
    date: string,
    hour: number,
    patch: Partial<Pick<HourlyEntry, 'pastChoice' | 'pastNote' | 'intention' | 'respondedAt'>>,
    nowIso: string
  ): Promise<HourlyEntry> {
    return withKeyLock(KEYS.hourlyEntries, async () => {
      const all = await this.list();
      const id = hourlyEntryId(date, hour);
      const existing = all.find((e) => e.id === id);
      const next: HourlyEntry = existing
        ? { ...existing, ...patch, updatedAt: nowIso }
        : { id, date, hour, ...patch, createdAt: nowIso, updatedAt: nowIso };
      await writeJSON(KEYS.hourlyEntries, [...all.filter((e) => e.id !== id), next]);
      return next;
    });
  }
}

// Future: replace with a client calling `GET/PUT /hourly-settings`.
class AsyncStorageHourlySettingsRepository implements HourlySettingsRepository {
  async get(): Promise<HourlyCheckInSettings | null> {
    return readJSON<HourlyCheckInSettings | null>(KEYS.hourlySettings, null);
  }

  async save(settings: HourlyCheckInSettings): Promise<void> {
    await writeJSON(KEYS.hourlySettings, settings);
  }
}

export function createAsyncStorageRepositories(): AppRepositories {
  return {
    preferences: new AsyncStoragePreferencesRepository(),
    tasks: new AsyncStorageTaskRepository(),
    plans: new AsyncStoragePlanRepository(),
    focusSessions: new AsyncStorageFocusSessionRepository(),
    checkIns: new AsyncStorageCheckInRepository(),
    interviews: new AsyncStorageInterviewRepository(),
    notes: new AsyncStorageNoteRepository(),
    studyQuestions: new AsyncStorageStudyQuestionRepository(),
    questionAttempts: new AsyncStorageQuestionAttemptRepository(),
    reminders: new AsyncStorageReminderRepository(),
    habits: new AsyncStorageHabitRepository(),
    habitCheckIns: new AsyncStorageHabitCheckInRepository(),
    projects: new AsyncStorageProjectRepository(),
    milestones: new AsyncStorageMilestoneRepository(),
    hourlyEntries: new AsyncStorageHourlyEntryRepository(),
    hourlySettings: new AsyncStorageHourlySettingsRepository(),
    async resetAll() {
      await AsyncStorage.multiRemove(Object.values(KEYS));
    },
  };
}
