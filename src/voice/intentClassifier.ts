/**
 * Local keyword-based classifier for free-form voice capture — not an LLM call (the app has no
 * AI backend wired up; see src/ai/aiProvider.ts). It only ever *suggests* a destination and a
 * title guess; the capture screen always shows this as an editable, overridable suggestion
 * before anything is created, same principle as aiProvider's "never write directly."
 */

export type VoiceDestination = 'quiz' | 'interview' | 'urgent_task' | 'task' | 'mood' | 'note';

export interface VoiceCaptureSuggestion {
  destination: VoiceDestination;
  /** Shown in the UI so the suggestion is legible rather than a black box. */
  reason: string;
  /** Only meaningful for task/urgent_task/interview/note — a short title derived from the transcript. */
  titleGuess: string;
  /** Same-day (0) or next-day (1) deadline hint for task destinations, else null. */
  deadlineOffsetDays: 0 | 1 | null;
}

const QUIZ_WORDS = ['quiz', 'five questions', '5 questions', 'flashcard', 'test me', 'practice session', 'practice quiz'];
const INTERVIEW_WORDS = ['interview', 'interviewer', 'interviewed', 'recruiter', 'hiring manager', 'they asked me'];
const URGENCY_WORDS = ['urgent', 'asap', 'as soon as possible', 'right away', 'immediately', 'emergency'];
const TASK_WORDS = [
  'need to', 'have to', 'i must', 'i should', 'remind me to', "don't forget to", 'dont forget to',
  'task', 'to-do', 'todo', 'got to', 'gotta', 'schedule', 'add a task', 'deadline', 'due',
];
const MOOD_WORDS = [
  'feeling', 'i feel', 'my mood', 'stressed', 'anxious', 'overwhelmed', 'exhausted', 'burnt out',
  'burned out', 'frustrated', 'worried', 'nervous', 'struggling', 'low energy', 'high energy',
  'tough day', 'rough day', 'great day', 'proud of myself',
];
const NOTE_WORDS = ['note', 'notes', 'revise', 'revision', 'write down', 'remember that', 'jot down'];

const DEADLINE_TOMORROW = ['tomorrow'];
const DEADLINE_TODAY = ['today', 'tonight', 'this morning', 'this afternoon', 'this evening', 'right now'];

const FILLER_PREFIXES: RegExp[] = [
  /^(um+|uh+|so|okay|ok|well|like)[,\s]+/i,
  /^i\s+(?:need|have|want|got|gotta)\s+to\s+/i,
  /^i\s+should\s+/i,
  /^remind me to\s+/i,
  /^don'?t forget to\s+/i,
  /^please\s+/i,
];

function countMatches(lower: string, phrases: string[]): number {
  return phrases.reduce((n, phrase) => n + (lower.includes(phrase) ? 1 : 0), 0);
}

function guessDeadlineOffsetDays(lower: string): 0 | 1 | null {
  if (DEADLINE_TOMORROW.some((w) => lower.includes(w))) return 1;
  if (DEADLINE_TODAY.some((w) => lower.includes(w))) return 0;
  return null;
}

function guessTitle(transcript: string): string {
  let t = transcript.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of FILLER_PREFIXES) {
      if (re.test(t)) {
        t = t.replace(re, '');
        changed = true;
      }
    }
  }
  const cut = t.split(/[.!?]|(?:\s+(?:because|so that|and then|urgent|asap)\b)/i)[0]?.trim();
  const result = cut && cut.length > 0 ? cut : t;
  const capped = result.length > 60 ? `${result.slice(0, 57).trimEnd()}…` : result;
  return capped.length > 0 ? capped.charAt(0).toUpperCase() + capped.slice(1) : 'Voice capture';
}

export function classifyVoiceCapture(transcript: string): VoiceCaptureSuggestion {
  const lower = transcript.toLowerCase();
  const titleGuess = guessTitle(transcript);
  const deadlineOffsetDays = guessDeadlineOffsetDays(lower);

  const scores: Record<Exclude<VoiceDestination, 'urgent_task'>, number> = {
    quiz: countMatches(lower, QUIZ_WORDS) * 3,
    interview: countMatches(lower, INTERVIEW_WORDS) * 3,
    task: countMatches(lower, TASK_WORDS) * 2 + countMatches(lower, URGENCY_WORDS),
    mood: countMatches(lower, MOOD_WORDS) * 2,
    note: countMatches(lower, NOTE_WORDS) * 2,
  };

  // Priority order breaks ties — quiz/interview are the most specific signals, note is the safe catch-all.
  const priority: (keyof typeof scores)[] = ['quiz', 'interview', 'task', 'mood', 'note'];
  const top = priority.reduce((best, key) => (scores[key] > scores[best] ? key : best), priority[0]);

  if (scores[top] === 0) {
    return {
      destination: 'note',
      reason: "Didn't match a specific category — saved as a note so nothing gets lost.",
      titleGuess,
      deadlineOffsetDays,
    };
  }

  if (top === 'task') {
    const isUrgent = countMatches(lower, URGENCY_WORDS) > 0 || deadlineOffsetDays === 0;
    return {
      destination: isUrgent ? 'urgent_task' : 'task',
      reason: isUrgent
        ? 'Sounds urgent — this will prompt a same-day replan.'
        : 'Sounds like something to schedule as a task.',
      titleGuess,
      deadlineOffsetDays,
    };
  }

  const reasonByDestination: Record<Exclude<VoiceDestination, 'urgent_task' | 'task'>, string> = {
    quiz: "Mentioned a quiz/practice — let's jump into today's practice set.",
    interview: 'Sounds like interview notes.',
    mood: 'Sounds like a reflection on how you\'re feeling.',
    note: 'Saved as a note.',
  };

  return {
    destination: top,
    reason: reasonByDestination[top],
    titleGuess,
    deadlineOffsetDays,
  };
}
