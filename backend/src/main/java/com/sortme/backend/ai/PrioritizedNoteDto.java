package com.sortme.backend.ai;

public record PrioritizedNoteDto(String importedDocumentId, String title, String reason, int priorityRank) {
}
