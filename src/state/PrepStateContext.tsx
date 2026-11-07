import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { selectDailyPracticeSet } from '../prep/studyEngine';
import type { Confidence, InterviewEntry, Note, NoteSource, QuestionAttempt, StudyQuestion } from '../prep/types';
import { createAsyncStorageRepositories } from '../storage/asyncStorageRepositories';
import type { AppRepositories } from '../storage/repository';
import { generateId } from '../utils/id';

export interface NewInterviewInput {
  company: string;
  role: string;
  stage: InterviewEntry['stage'];
  interviewDate?: string;
  outcome: InterviewEntry['outcome'];
  followUpDate?: string;
  questionsAsked: string[];
  notes?: string;
}

export interface NewNoteInput {
  title: string;
  topic: string;
  body: string;
  source?: NoteSource;
  sourceRef?: string;
}

export interface NewQuestionInput {
  noteId: string;
  question: string;
  answer: string;
}

interface PrepStateValue {
  loading: boolean;
  interviews: InterviewEntry[];
  notes: Note[];
  studyQuestions: StudyQuestion[];
  questionAttempts: QuestionAttempt[];
  addInterview: (input: NewInterviewInput) => Promise<InterviewEntry>;
  updateInterview: (id: string, patch: Partial<InterviewEntry>) => Promise<void>;
  removeInterview: (id: string) => Promise<void>;
  addNote: (input: NewNoteInput) => Promise<Note>;
  updateNote: (id: string, patch: Partial<Note>) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  addQuestion: (input: NewQuestionInput) => Promise<StudyQuestion>;
  removeQuestion: (id: string) => Promise<void>;
  recordAttempt: (questionId: string, confidence: Confidence) => Promise<void>;
  dailyPracticeSet: (count?: number) => StudyQuestion[];
}

const PrepStateContext = createContext<PrepStateValue | null>(null);

export function PrepStateProvider({
  children,
  repositories,
}: {
  children: React.ReactNode;
  repositories?: AppRepositories;
}) {
  const repos = useMemo(() => repositories ?? createAsyncStorageRepositories(), [repositories]);
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<InterviewEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [studyQuestions, setStudyQuestions] = useState<StudyQuestion[]>([]);
  const [questionAttempts, setQuestionAttempts] = useState<QuestionAttempt[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [i, n, q, a] = await Promise.all([
        repos.interviews.list(),
        repos.notes.list(),
        repos.studyQuestions.list(),
        repos.questionAttempts.list(),
      ]);
      if (!cancelled) {
        setInterviews(i);
        setNotes(n);
        setStudyQuestions(q);
        setQuestionAttempts(a);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const value = useMemo<PrepStateValue>(() => {
    const now = () => new Date().toISOString();

    return {
      loading,
      interviews,
      notes,
      studyQuestions,
      questionAttempts,
      addInterview: async (input) => {
        const entry: InterviewEntry = {
          id: generateId('interview'),
          ...input,
          followUpDone: false,
          createdAt: now(),
          updatedAt: now(),
        };
        await repos.interviews.save(entry);
        setInterviews((prev) => [...prev, entry]);
        return entry;
      },
      updateInterview: async (id, patch) => {
        const existing = interviews.find((e) => e.id === id);
        if (!existing) return;
        const updated: InterviewEntry = { ...existing, ...patch, updatedAt: now() };
        await repos.interviews.save(updated);
        setInterviews((prev) => prev.map((e) => (e.id === id ? updated : e)));
      },
      removeInterview: async (id) => {
        await repos.interviews.remove(id);
        setInterviews((prev) => prev.filter((e) => e.id !== id));
      },
      addNote: async (input) => {
        const note: Note = {
          id: generateId('note'),
          title: input.title,
          topic: input.topic,
          body: input.body,
          source: input.source ?? 'manual',
          sourceRef: input.sourceRef,
          createdAt: now(),
          updatedAt: now(),
        };
        await repos.notes.save(note);
        setNotes((prev) => [...prev, note]);
        return note;
      },
      updateNote: async (id, patch) => {
        const existing = notes.find((n) => n.id === id);
        if (!existing) return;
        const updated: Note = { ...existing, ...patch, updatedAt: now() };
        await repos.notes.save(updated);
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      },
      removeNote: async (id) => {
        await repos.notes.remove(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        // Questions authored from a deleted note no longer have a source to trace back to.
        const orphaned = studyQuestions.filter((q) => q.noteId === id);
        await Promise.all(orphaned.map((q) => repos.studyQuestions.remove(q.id)));
        setStudyQuestions((prev) => prev.filter((q) => q.noteId !== id));
      },
      addQuestion: async (input) => {
        const note = notes.find((n) => n.id === input.noteId);
        const question: StudyQuestion = {
          id: generateId('question'),
          noteId: input.noteId,
          topic: note?.topic ?? 'general',
          question: input.question,
          answer: input.answer,
          createdAt: now(),
        };
        await repos.studyQuestions.save(question);
        setStudyQuestions((prev) => [...prev, question]);
        return question;
      },
      removeQuestion: async (id) => {
        await repos.studyQuestions.remove(id);
        setStudyQuestions((prev) => prev.filter((q) => q.id !== id));
      },
      recordAttempt: async (questionId, confidence) => {
        const attempt: QuestionAttempt = {
          id: generateId('attempt'),
          questionId,
          confidence,
          attemptedAt: now(),
        };
        await repos.questionAttempts.save(attempt);
        setQuestionAttempts((prev) => [...prev, attempt]);
      },
      dailyPracticeSet: (count = 5) => selectDailyPracticeSet(studyQuestions, questionAttempts, now(), count),
    };
  }, [loading, interviews, notes, studyQuestions, questionAttempts, repos]);

  return <PrepStateContext.Provider value={value}>{children}</PrepStateContext.Provider>;
}

export function usePrepState(): PrepStateValue {
  const ctx = useContext(PrepStateContext);
  if (!ctx) throw new Error('usePrepState must be used within a PrepStateProvider');
  return ctx;
}
