import { getPrepPriorities, listNeedsReply } from '../ai/api';
import { listConnections, listImportedItems } from '../connections/api';
import { dueFollowUps, nearestUpcomingInterview } from '../prep/interviewEngine';
import { topicsNeedingPractice } from '../prep/studyEngine';
import type { InterviewEntry, Note, QuestionAttempt, StudyQuestion } from '../prep/types';
import type { DailySuggestion } from './types';

/** How many email-reply suggestions the digest surfaces -- the underlying
 * thread list can be long once automated senders are filtered out, and the
 * digest is meant to be a short daily glance, not a full inbox dump (the
 * "Find emails awaiting your reply" screen already covers the full list). */
const MAX_EMAIL_REPLY_SUGGESTIONS = 3;

/** Automated/no-reply senders that technically "haven't been replied to"
 * but were never meant to be replied to -- job-alert digests, application
 * confirmations, mailer-daemon bounces, etc. A reply-needed heuristic based
 * only on "who sent the last message" can't tell these apart from a real
 * person waiting to hear back, so they're filtered out here by address
 * pattern instead. */
const AUTOMATED_SENDER_PATTERNS = [
  'no-reply',
  'noreply',
  'do-not-reply',
  'donotreply',
  'mailer-daemon',
  'notifications@',
  'notification@',
  'digest@',
  'alerts@',
  'jobs@',
];

function looksAutomated(fromAddress: string | null): boolean {
  if (!fromAddress) return false;
  const lower = fromAddress.toLowerCase();
  return AUTOMATED_SENDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

export interface BuildDailySuggestionsInput {
  interviews: InterviewEntry[];
  studyQuestions: StudyQuestion[];
  questionAttempts: QuestionAttempt[];
  notes: Note[];
  today: string; // YYYY-MM-DD, local
  nowMs: number;
}

/**
 * Merges three already-built, mostly-zero-AI signals into one daily digest:
 * interview follow-ups due, Gmail threads awaiting reply, and revision
 * suggestions (interview-grounded when one is coming up soon, otherwise
 * general spaced-revision topics). Each source fails independently -- one
 * source erroring (e.g. a transient Gmail API issue) never blanks the
 * whole digest, it just means fewer suggestions that day.
 */
export async function buildDailySuggestions(input: BuildDailySuggestionsInput): Promise<DailySuggestion[]> {
  const suggestions: DailySuggestion[] = [];

  // Fetched fresh here rather than taken from ConnectionsStateContext,
  // which only populates once a Connect-tab screen has called its own
  // refresh -- the Today screen (usually the first screen opened) can't
  // rely on that state being loaded yet.
  const [connections, importedItems] = await Promise.all([
    listConnections().catch(() => []),
    listImportedItems().catch(() => []),
  ]);
  const gmailConnected = connections.some((c) => c.provider === 'GOOGLE_GMAIL' && c.status === 'CONNECTED');
  const hasImportedDocs = importedItems.some((i) => i.type === 'DOCUMENT');

  for (const entry of dueFollowUps(input.interviews, input.today)) {
    suggestions.push({
      id: `followup:${entry.id}`,
      kind: 'interview_followup',
      title: `Follow up: ${entry.company}`,
      subtitle: `${entry.role} — follow-up was due`,
      route: `/interviews/${entry.id}`,
    });
  }

  if (gmailConnected) {
    try {
      const threads = await listNeedsReply();
      const repliable = threads.filter((t) => !looksAutomated(t.fromAddress)).slice(0, MAX_EMAIL_REPLY_SUGGESTIONS);
      for (const thread of repliable) {
        suggestions.push({
          id: `reply:${thread.threadId}`,
          kind: 'email_reply',
          title: `Reply: ${thread.subject ?? '(no subject)'}`,
          subtitle: thread.fromAddress ? `From ${thread.fromAddress}` : 'Awaiting your reply',
          route: '/connections/gmail-needs-reply',
        });
      }
    } catch {
      // Best-effort -- a transient failure here shouldn't break the digest.
    }
  }

  const nearestInterview = nearestUpcomingInterview(input.interviews, input.nowMs);
  if (nearestInterview && hasImportedDocs) {
    try {
      const context = `${nearestInterview.role} interview at ${nearestInterview.company}`;
      const response = await getPrepPriorities(context);
      for (const note of response.prioritizedNotes.slice(0, 3)) {
        const existingNote = input.notes.find((n) => n.source === 'google_doc' && n.sourceRef === note.importedDocumentId);
        suggestions.push({
          id: `revise-interview:${note.importedDocumentId}`,
          kind: 'revise_interview_note',
          title: `Revise: ${note.title}`,
          subtitle: `For your ${nearestInterview.role} interview at ${nearestInterview.company}`,
          route: existingNote
            ? `/notes/${existingNote.id}`
            : `/connections/google-docs-questions?rawDocId=${encodeURIComponent(note.importedDocumentId)}&title=${encodeURIComponent(note.title)}`,
        });
      }
    } catch {
      // Best-effort -- deliberately does NOT fall through to general topics
      // below: an interview-specific failure should mean fewer suggestions,
      // not silently swap in unrelated general revision topics.
    }
  } else {
    const topics = topicsNeedingPractice(input.studyQuestions, input.questionAttempts);
    for (const topic of topics.slice(0, 3)) {
      suggestions.push({
        id: `revise-topic:${topic}`,
        kind: 'revise_topic',
        title: `Revise: ${topic}`,
        subtitle: 'Due for practice',
        route: '/practice',
      });
    }
  }

  return suggestions;
}
