import type { EveningReview, MorningCheckIn } from '../checkins/types';
import type { FocusSession } from '../focus/types';
import type { HabitCheckIn, HabitDefinition } from '../habits/types';
import type { HourlyCheckInSettings, HourlyEntry } from '../hourly/types';
import type { PlanVersion, Preferences, Task } from '../planning/types';
import type { InterviewEntry, Note, QuestionAttempt, StudyQuestion } from '../prep/types';
import type { Milestone, Project } from '../projects/types';
import type { ScheduledReminder } from '../reminders/types';

/**
 * Storage interfaces shaped after the blueprint's minimal API
 * (`GET/PUT /preferences`, `POST/GET/PATCH /tasks`, `POST /plans/...`).
 * Swapping the AsyncStorage-backed implementations below for HTTP clients
 * that call a future Spring Boot backend requires no change to callers.
 *
 * Every repository below (focus sessions, check-ins, interviews, notes,
 * study questions/attempts, reminders) is personal planning data local to
 * this device, following the same rule the original slice established:
 * it stays in AsyncStorage next to tasks and plans, not in the Connections
 * backend, until a deliberate migration with per-account isolation exists.
 */
export interface PreferencesRepository {
  get(): Promise<Preferences | null>;
  save(preferences: Preferences): Promise<void>;
}

export interface TaskRepository {
  list(): Promise<Task[]>;
  create(task: Task): Promise<void>;
  update(id: string, patch: Partial<Task>): Promise<void>;
}

export interface PlanRepository {
  listVersions(): Promise<PlanVersion[]>;
  saveVersion(version: PlanVersion): Promise<void>;
  getCurrentVersionId(date: string): Promise<string | null>;
  setCurrentVersionId(date: string, versionId: string): Promise<void>;
  /** The full date → current-version-id map, for screens that need more than one date at once. */
  getAllCurrentVersionIds(): Promise<Record<string, string>>;
}

export interface FocusSessionRepository {
  list(): Promise<FocusSession[]>;
  save(session: FocusSession): Promise<void>;
}

export interface CheckInRepository {
  listMorning(): Promise<MorningCheckIn[]>;
  saveMorning(checkIn: MorningCheckIn): Promise<void>;
  listEvening(): Promise<EveningReview[]>;
  saveEvening(review: EveningReview): Promise<void>;
}

export interface InterviewRepository {
  list(): Promise<InterviewEntry[]>;
  save(entry: InterviewEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface NoteRepository {
  list(): Promise<Note[]>;
  save(note: Note): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface StudyQuestionRepository {
  list(): Promise<StudyQuestion[]>;
  save(question: StudyQuestion): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface QuestionAttemptRepository {
  list(): Promise<QuestionAttempt[]>;
  save(attempt: QuestionAttempt): Promise<void>;
}

export interface ReminderRepository {
  list(): Promise<ScheduledReminder[]>;
  save(reminder: ScheduledReminder): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface HabitRepository {
  list(): Promise<HabitDefinition[]>;
  save(habit: HabitDefinition): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
}

export interface HabitCheckInRepository {
  list(): Promise<HabitCheckIn[]>;
  save(checkIn: HabitCheckIn): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  save(project: Project): Promise<void>;
}

export interface MilestoneRepository {
  list(): Promise<Milestone[]>;
  save(milestone: Milestone): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface HourlyEntryRepository {
  list(): Promise<HourlyEntry[]>;
  /** Atomic find-or-create-by-(date,hour) + merge, entirely inside one storage lock — the same race-free shape as TaskRepository.update. */
  upsert(
    date: string,
    hour: number,
    patch: Partial<Pick<HourlyEntry, 'pastChoice' | 'pastNote' | 'intention' | 'respondedAt'>>,
    nowIso: string
  ): Promise<HourlyEntry>;
}

export interface HourlySettingsRepository {
  get(): Promise<HourlyCheckInSettings | null>;
  save(settings: HourlyCheckInSettings): Promise<void>;
}

export interface AppRepositories {
  preferences: PreferencesRepository;
  tasks: TaskRepository;
  plans: PlanRepository;
  focusSessions: FocusSessionRepository;
  checkIns: CheckInRepository;
  interviews: InterviewRepository;
  notes: NoteRepository;
  studyQuestions: StudyQuestionRepository;
  questionAttempts: QuestionAttemptRepository;
  reminders: ReminderRepository;
  habits: HabitRepository;
  habitCheckIns: HabitCheckInRepository;
  projects: ProjectRepository;
  milestones: MilestoneRepository;
  hourlyEntries: HourlyEntryRepository;
  hourlySettings: HourlySettingsRepository;
  /** Wipes all locally persisted app data (used by the "reset app data" setting). */
  resetAll(): Promise<void>;
}
