import type { ISODate, ISODateTime } from '../planning/types';

export type InterviewStage = 'applied' | 'phone_screen' | 'technical' | 'onsite' | 'offer' | 'closed';

// Deliberately neutral language for every outcome, including rejection and
// silence — this is a personal tracker, not a scoreboard.
export type InterviewOutcome = 'pending' | 'passed_round' | 'not_selected' | 'no_response' | 'offer_received' | 'withdrawn';

export interface InterviewEntry {
  id: string;
  company: string;
  role: string;
  stage: InterviewStage;
  interviewDate?: ISODateTime;
  outcome: InterviewOutcome;
  followUpDate?: ISODate;
  followUpDone: boolean;
  questionsAsked: string[];
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// 'google_doc' is reserved for later: once a Google Doc can be selected as
// a note source, notes created that way carry sourceRef = the imported
// item's id. Nothing downstream (StudyQuestion, QuestionAttempt, practice
// selection) reads `source` or `sourceRef` at all — they only ever
// reference a Note by id — so wiring that in later requires no change to
// the study logic.
export type NoteSource = 'manual' | 'google_doc';

export interface Note {
  id: string;
  title: string;
  topic: string;
  body: string;
  source: NoteSource;
  sourceRef?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface StudyQuestion {
  id: string;
  noteId: string;
  /** Denormalized from the note at creation time so it survives note edits. */
  topic: string;
  question: string;
  answer: string;
  createdAt: ISODateTime;
}

export type Confidence = 'low' | 'medium' | 'high';

export interface QuestionAttempt {
  id: string;
  questionId: string;
  attemptedAt: ISODateTime;
  confidence: Confidence;
}
