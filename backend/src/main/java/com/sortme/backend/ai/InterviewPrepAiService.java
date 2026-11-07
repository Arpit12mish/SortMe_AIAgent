package com.sortme.backend.ai;

import com.sortme.backend.imported.ImportedDocument;
import com.sortme.backend.imported.ImportedDocumentRepository;
import com.sortme.backend.imported.ImportedEmail;
import com.sortme.backend.imported.ImportedEmailRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class InterviewPrepAiService {

    /** Classification/matching only -- emails are passed as subject/from/
     * snippet (not full body) and docs as id/title (not content), so the
     * prompt stays small even with many imported items. */
    private static final int MAX_EMAILS = 30;

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
        "type", "object",
        "properties", Map.of(
            "interviewContext", Map.of("type", "string",
                "description", "A short summary of any interview signal found, or an explanation that none was found"),
            "prioritizedNotes", Map.of(
                "type", "array",
                "items", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "importedDocumentId", Map.of("type", "string"),
                        "reason", Map.of("type", "string"),
                        "priorityRank", Map.of("type", "integer")
                    ),
                    "required", List.of("importedDocumentId", "reason", "priorityRank")
                )
            )
        ),
        "required", List.of("interviewContext", "prioritizedNotes")
    );

    private final ImportedEmailRepository importedEmailRepository;
    private final ImportedDocumentRepository importedDocumentRepository;
    private final GeminiClient geminiClient;

    record RawPriority(String importedDocumentId, String reason, int priorityRank) {
    }

    record PrioritiesPayload(String interviewContext, List<RawPriority> prioritizedNotes) {
    }

    public PrepPrioritiesResponse prioritize(UUID userId, String extraContext) {
        List<ImportedEmail> emails = importedEmailRepository.findAllByUserId(userId).stream()
            .filter(ImportedEmail::isIncludedInPlanning)
            .sorted(Comparator.comparing(ImportedEmail::getReceivedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .limit(MAX_EMAILS)
            .toList();

        List<ImportedDocument> docs = importedDocumentRepository.findAllByUserId(userId).stream()
            .filter(ImportedDocument::isIncludedInPlanning)
            .toList();

        if (docs.isEmpty()) {
            return new PrepPrioritiesResponse("No notes are available to prioritize yet.", List.of());
        }

        Map<String, ImportedDocument> byId = docs.stream().collect(Collectors.toMap(d -> d.getId().toString(), d -> d));

        StringBuilder emailSection = new StringBuilder();
        for (ImportedEmail e : emails) {
            emailSection.append("from: ").append(e.getFromAddress())
                .append(" | subject: ").append(e.getSubject())
                .append(" | snippet: ").append(e.getSnippet()).append('\n');
        }

        StringBuilder docSection = new StringBuilder();
        for (ImportedDocument d : docs) {
            docSection.append("id: ").append(d.getId()).append(" | title: ").append(d.getTitle()).append('\n');
        }

        String systemInstruction = "Given a user's recent emails and the titles of their available study notes, "
            + "infer any upcoming or recent interview signal (company, role) from the emails, then rank the given "
            + "candidate note titles by how relevant they are to revise for that signal. If no interview signal is "
            + "found, return an empty prioritizedNotes list and explain that in interviewContext. Only reference "
            + "note ids exactly as given in the available-notes list -- never invent one.";

        String userContent = "Extra context from the user: "
            + (extraContext == null || extraContext.isBlank() ? "(none)" : extraContext)
            + "\n\nRecent emails:\n" + emailSection
            + "\n\nAvailable notes:\n" + docSection;

        PrioritiesPayload payload = geminiClient.generateStructured(systemInstruction, userContent, RESPONSE_SCHEMA, PrioritiesPayload.class);

        // Hallucinated ids are dropped; titles are always re-attached from
        // the trusted server-side map, never taken from the model's output.
        List<PrioritizedNoteDto> notes = payload.prioritizedNotes().stream()
            .filter(p -> byId.containsKey(p.importedDocumentId()))
            .sorted(Comparator.comparingInt(RawPriority::priorityRank))
            .map(p -> new PrioritizedNoteDto(p.importedDocumentId(), byId.get(p.importedDocumentId()).getTitle(), p.reason(), p.priorityRank()))
            .toList();

        return new PrepPrioritiesResponse(payload.interviewContext(), notes);
    }
}
