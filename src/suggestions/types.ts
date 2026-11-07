export type DailySuggestionKind = 'interview_followup' | 'email_reply' | 'revise_interview_note' | 'revise_topic';

export interface DailySuggestion {
  id: string;
  kind: DailySuggestionKind;
  title: string;
  subtitle: string;
  route: string;
}
