import type { PlanVersion, Preferences, Task } from '../planning/types';

/**
 * Storage interfaces shaped after the blueprint's minimal API
 * (`GET/PUT /preferences`, `POST/GET/PATCH /tasks`, `POST /plans/...`).
 * Swapping the AsyncStorage-backed implementations below for HTTP clients
 * that call a future Spring Boot backend requires no change to callers.
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
}

export interface AppRepositories {
  preferences: PreferencesRepository;
  tasks: TaskRepository;
  plans: PlanRepository;
  /** Wipes all locally persisted app data (used by the "reset app data" setting). */
  resetAll(): Promise<void>;
}
