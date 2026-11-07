package com.sortme.backend.ai;

import java.util.List;

public record PrepPrioritiesResponse(String interviewContext, List<PrioritizedNoteDto> prioritizedNotes) {
}
