// Mirrors the backend's com.sortme.backend.ai DTOs exactly -- keep in sync
// by hand, same convention as src/connections/types.ts.

export interface GeneratedQuestion {
  question: string;
  answer: string;
}

export interface GenerateQuestionsResponse {
  documentTitle: string | null;
  documentContentText: string | null;
  questions: GeneratedQuestion[];
}

export type TaskPrioritySuggestion = 'low' | 'medium' | 'high' | 'urgent';

export interface ExtractedTaskSuggestion {
  title: string;
  suggestedDueDate: string | null; // YYYY-MM-DD
  priority: TaskPrioritySuggestion;
  sourceEmailSubject: string | null;
}

export interface ExtractTasksResponse {
  tasks: ExtractedTaskSuggestion[];
}

export interface PrioritizedNote {
  importedDocumentId: string;
  title: string;
  reason: string;
  priorityRank: number;
}

export interface PrepPrioritiesResponse {
  interviewContext: string;
  prioritizedNotes: PrioritizedNote[];
}

export interface NeedsReplyThread {
  threadId: string;
  subject: string | null;
  fromAddress: string | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number | null;
  stale: boolean;
  link: string | null;
}

export interface DraftReply {
  to: string | null;
  subject: string;
  body: string;
}

export interface CareerInsight {
  headline: string;
  signal: string;
  suggestedAction: string;
  relevance: string;
}

export interface CareerInsightsResponse {
  generatedAt: string;
  insights: CareerInsight[];
}

export interface BriefingTaskSuggestion {
  title: string;
  estimateMinutes: number;
  suggestedDueDate: string | null; // YYYY-MM-DD
  priority: TaskPrioritySuggestion;
  sourceEmailSubject: string | null;
}

export interface BriefingInterviewSuggestion {
  company: string;
  role: string;
  interviewerName: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm, 24-hour
  timezone: string | null;
  /** True whenever the date or time is missing or was flagged ambiguous -- must be confirmed before becoming a real interview. */
  dateTimeUncertain: boolean;
  meetingLinkOrLocation: string | null;
  sourceEmailSubject: string | null;
}

export interface DailyBriefingResponse {
  summary: string;
  tasks: BriefingTaskSuggestion[];
  interviews: BriefingInterviewSuggestion[];
  uncertainties: string[];
}
