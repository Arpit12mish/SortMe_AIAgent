package com.sortme.backend.ai;

import com.sortme.backend.imported.ImportedEmail;
import com.sortme.backend.imported.ImportedEmailRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EmailTaskExtractionAiService {

    /** Keeps the combined prompt small/fast/cheap; task extraction needs the
     * actionable sentence, not a whole email thread signature block. */
    private static final int MAX_EMAILS = 15;
    private static final int BODY_EXCERPT_CHARS = 4000;

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
        "type", "object",
        "properties", Map.of(
            "tasks", Map.of(
                "type", "array",
                "items", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "title", Map.of("type", "string"),
                        "suggestedDueDate", Map.of("type", "string", "nullable", true,
                            "description", "YYYY-MM-DD if the email implies a date, otherwise omitted"),
                        "priority", Map.of("type", "string", "enum", List.of("low", "medium", "high", "urgent")),
                        "sourceEmailId", Map.of("type", "string")
                    ),
                    "required", List.of("title", "priority", "sourceEmailId")
                )
            )
        ),
        "required", List.of("tasks")
    );

    private final ImportedEmailRepository importedEmailRepository;
    private final GeminiClient geminiClient;

    record RawTask(String title, String suggestedDueDate, String priority, String sourceEmailId) {
    }

    record TasksPayload(List<RawTask> tasks) {
    }

    public ExtractTasksResponse extractTasks(UUID userId) {
        List<ImportedEmail> emails = importedEmailRepository.findAllByUserId(userId).stream()
            .filter(ImportedEmail::isIncludedInPlanning)
            .sorted(Comparator.comparing(ImportedEmail::getReceivedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .limit(MAX_EMAILS)
            .toList();

        if (emails.isEmpty()) {
            return new ExtractTasksResponse(List.of());
        }

        Map<String, ImportedEmail> byId = emails.stream().collect(Collectors.toMap(e -> e.getId().toString(), e -> e));

        StringBuilder sb = new StringBuilder();
        for (ImportedEmail e : emails) {
            String body = e.getBodyText() != null ? e.getBodyText() : e.getSnippet();
            String excerpt = body != null ? body.substring(0, Math.min(BODY_EXCERPT_CHARS, body.length())) : "";
            sb.append("id: ").append(e.getId()).append('\n')
                .append("from: ").append(e.getFromAddress()).append('\n')
                .append("subject: ").append(e.getSubject()).append('\n')
                .append("body: ").append(excerpt).append("\n---\n");
        }

        String systemInstruction = "Extract concrete, actionable tasks a job-seeker would want to add to their "
            + "to-do list from these emails (e.g. application deadlines, interview prep, follow-ups). Ignore "
            + "newsletters/notifications with no action. For each task, cite which email it came from by its id "
            + "exactly as given.";

        TasksPayload payload = geminiClient.generateStructured(systemInstruction, sb.toString(), RESPONSE_SCHEMA, TasksPayload.class);

        // Hallucinated/unknown sourceEmailId values are dropped (subject
        // becomes null) rather than forwarded -- never trust an echoed id.
        List<ExtractedTaskDto> tasks = payload.tasks().stream()
            .map(t -> {
                ImportedEmail source = byId.get(t.sourceEmailId());
                return new ExtractedTaskDto(t.title(), validDateOrNull(t.suggestedDueDate()), t.priority(),
                    source != null ? source.getSubject() : null);
            })
            .toList();

        return new ExtractTasksResponse(tasks);
    }

    private String validDateOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            LocalDate.parse(value);
            return value;
        } catch (Exception e) {
            return null;
        }
    }
}
