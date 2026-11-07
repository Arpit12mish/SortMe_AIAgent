package com.sortme.backend.ai;

/** `suggestedDueDate` is null unless Gemini implied one AND it parsed as a
 * valid ISO date -- never forwarded unvalidated. */
public record ExtractedTaskDto(String title, String suggestedDueDate, String priority, String sourceEmailSubject) {
}
