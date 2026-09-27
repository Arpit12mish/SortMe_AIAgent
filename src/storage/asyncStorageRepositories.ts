import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanVersion, Preferences, Task } from '../planning/types';
import type { AppRepositories, PlanRepository, PreferencesRepository, TaskRepository } from './repository';

const KEYS = {
  preferences: '@sortme/preferences',
  tasks: '@sortme/tasks',
  planVersions: '@sortme/planVersions',
  currentPlanIdByDate: '@sortme/currentPlanIdByDate',
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
    const tasks = await this.list();
    await writeJSON(KEYS.tasks, [...tasks, task]);
  }

  async update(id: string, patch: Partial<Task>): Promise<void> {
    const tasks = await this.list();
    const next = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    await writeJSON(KEYS.tasks, next);
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
    const versions = await this.listVersions();
    const withoutPrevious = versions.filter((v) => v.id !== version.id);
    await writeJSON(KEYS.planVersions, [...withoutPrevious, version]);
  }

  async getCurrentVersionId(date: string): Promise<string | null> {
    const map = await readJSON<Record<string, string>>(KEYS.currentPlanIdByDate, {});
    return map[date] ?? null;
  }

  async setCurrentVersionId(date: string, versionId: string): Promise<void> {
    const map = await readJSON<Record<string, string>>(KEYS.currentPlanIdByDate, {});
    await writeJSON(KEYS.currentPlanIdByDate, { ...map, [date]: versionId });
  }
}

export function createAsyncStorageRepositories(): AppRepositories {
  return {
    preferences: new AsyncStoragePreferencesRepository(),
    tasks: new AsyncStorageTaskRepository(),
    plans: new AsyncStoragePlanRepository(),
    async resetAll() {
      await AsyncStorage.multiRemove(Object.values(KEYS));
    },
  };
}
