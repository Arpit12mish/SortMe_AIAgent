package com.sortme.backend.ai;

/** `suggestedDueDate` is null unless the model implied one AND it parsed as
 * a valid ISO date; `sourceEmailSubject` is re-attached from the server's
 * own email map, never taken from the model. */
public record BriefingTaskSuggestion(String title, int estimateMinutes, String suggestedDueDate, String priority, String sourceEmailSubject) {
}
