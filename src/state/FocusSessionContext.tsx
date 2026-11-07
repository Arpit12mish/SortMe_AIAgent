import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as sessionEngine from '../focus/sessionEngine';
import type { FocusOutcome, FocusSession } from '../focus/types';
import type { Task } from '../planning/types';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';

interface FocusSessionValue {
  loading: boolean;
  sessions: FocusSession[];
  /** The one session currently running or paused, if any — enforced to be at most one. */
  activeSession: FocusSession | undefined;
  start: (task: Task, planBlockId?: string) => Promise<FocusSession>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: (outcome: FocusOutcome, note?: string) => Promise<FocusSession | undefined>;
  stopEarly: (outcome: FocusOutcome, note?: string) => Promise<FocusSession | undefined>;
}

const FocusSessionContext = createContext<FocusSessionValue | null>(null);

export function FocusSessionProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<FocusSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await repos.focusSessions.list();
      if (!cancelled) {
        setSessions(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const activeSession = useMemo(() => sessionEngine.findActiveSession(sessions), [sessions]);

  const persist = useCallback(
    async (session: FocusSession) => {
      await repos.focusSessions.save(session);
      setSessions((prev) => [...prev.filter((s) => s.id !== session.id), session]);
      return session;
    },
    [repos]
  );

  const start = useCallback<FocusSessionValue['start']>(
    async (task, planBlockId) => {
      const session = sessionEngine.startSession(sessions, {
        id: generateId('session'),
        taskId: task.id,
        taskTitle: task.title,
        planBlockId,
        estimateMinutes: task.estimateMinutes,
        nowIso: new Date().toISOString(),
      });
      return persist(session);
    },
    [sessions, persist]
  );

  const pause = useCallback(async () => {
    if (!activeSession) return;
    await persist(sessionEngine.pauseSession(activeSession, new Date().toISOString()));
  }, [activeSession, persist]);

  const resume = useCallback(async () => {
    if (!activeSession) return;
    await persist(sessionEngine.resumeSession(activeSession, new Date().toISOString()));
  }, [activeSession, persist]);

  const end = useCallback(
    async (mode: 'finished' | 'stopped_early', outcome: FocusOutcome, note?: string) => {
      if (!activeSession) return undefined;
      return persist(sessionEngine.endSession(activeSession, { mode, outcome, note, nowIso: new Date().toISOString() }));
    },
    [activeSession, persist]
  );

  const finish = useCallback<FocusSessionValue['finish']>((outcome, note) => end('finished', outcome, note), [end]);
  const stopEarly = useCallback<FocusSessionValue['stopEarly']>(
    (outcome, note) => end('stopped_early', outcome, note),
    [end]
  );

  const value = useMemo<FocusSessionValue>(
    () => ({ loading, sessions, activeSession, start, pause, resume, finish, stopEarly }),
    [loading, sessions, activeSession, start, pause, resume, finish, stopEarly]
  );

  return <FocusSessionContext.Provider value={value}>{children}</FocusSessionContext.Provider>;
}

export function useFocusSessions(): FocusSessionValue {
  const ctx = useContext(FocusSessionContext);
  if (!ctx) throw new Error('useFocusSessions must be used within a FocusSessionProvider');
  return ctx;
}
