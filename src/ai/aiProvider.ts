import type { Task } from '../planning/types';

/**
 * Extension point for the blueprint's Gemini adapter. This first slice
 * never calls an AI API — task capture is a manual structured form — but
 * keeping this interface in place means a future provider can be dropped
 * in behind it (e.g. for free-text task extraction or explaining a
 * replan in natural language) without the UI or planner needing to change.
 * Per the blueprint: the AI may only suggest structured fields; it must
 * never write tasks or plans directly.
 */
export interface AiProvider {
  extractTaskFromText(text: string): Promise<Partial<Task>>;
  explainPlanChange(summary: string): Promise<string>;
}

/** Default no-op provider used while no AI backend is configured. */
export const noopAiProvider: AiProvider = {
  async extractTaskFromText() {
    throw new Error('AI task extraction is not available in this slice; use the manual task form.');
  },
  async explainPlanChange(summary: string) {
    return summary;
  },
};
