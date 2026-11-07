import { apiFetch } from '../connections/api';
import type {
  CareerInsightsResponse,
  DailyBriefingResponse,
  DraftReply,
  ExtractTasksResponse,
  GenerateQuestionsResponse,
  NeedsReplyThread,
  PrepPrioritiesResponse,
} from './types';

export function generateStudyQuestions(importedDocumentId: string, count = 8): Promise<GenerateQuestionsResponse> {
  return apiFetch(`/api/ai/documents/${encodeURIComponent(importedDocumentId)}/questions`, {
    method: 'POST',
    query: { count: String(count) },
  });
}

export function extractTasksFromEmails(): Promise<ExtractTasksResponse> {
  return apiFetch('/api/ai/gmail/extract-tasks', { method: 'POST' });
}

export function getPrepPriorities(context?: string): Promise<PrepPrioritiesResponse> {
  return apiFetch('/api/ai/prep-priorities', { method: 'POST', body: context ? { context } : undefined });
}

export function listNeedsReply(): Promise<NeedsReplyThread[]> {
  return apiFetch('/api/ai/gmail/needs-reply');
}

export function draftGmailReply(threadId: string): Promise<DraftReply> {
  return apiFetch(`/api/ai/gmail/needs-reply/${encodeURIComponent(threadId)}/draft`, { method: 'POST' });
}

/** Google-Search-grounded, so this is slower than the other AI calls here --
 * expect several seconds. */
export function getCareerInsights(): Promise<CareerInsightsResponse> {
  return apiFetch('/api/ai/career-insights', { method: 'POST' });
}

/** `transcript` must already be the user's own reviewed/edited text.
 * `includeGmail`/`includeDocs` are explicit per-analysis consent -- not a
 * standing permission -- for whether recent emails/doc titles are sent
 * along as context. Returns suggestions only; nothing is created until the
 * caller turns an accepted one into a real task/interview itself. */
export function getDailyBriefing(transcript: string, includeGmail: boolean, includeDocs: boolean): Promise<DailyBriefingResponse> {
  return apiFetch('/api/ai/voice/daily-briefing', { method: 'POST', body: { transcript, includeGmail, includeDocs } });
}
