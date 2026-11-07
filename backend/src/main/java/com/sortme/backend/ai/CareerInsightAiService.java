package com.sortme.backend.ai;

import com.sortme.backend.imported.ImportedDocument;
import com.sortme.backend.imported.ImportedDocumentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Looks outward rather than over the user's own stored content: a weekly,
 * Google-Search-grounded read on current tech/job-market signal, matched
 * against a lightweight profile inferred from the titles of the user's
 * imported notes. Speculative by nature -- the response is always framed
 * as something to verify, never a guaranteed fact. */
@Service
@RequiredArgsConstructor
public class CareerInsightAiService {

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
        "type", "object",
        "properties", Map.of(
            "insights", Map.of(
                "type", "array",
                "items", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "headline", Map.of("type", "string", "description", "Short, specific -- names the actual trend/technology/certification"),
                        "signal", Map.of("type", "string", "description", "What concrete, current, dated evidence this is based on (a real source/event), not a vague generality"),
                        "suggestedAction", Map.of("type", "string", "description", "A concrete next step, e.g. a specific certification or skill to pursue"),
                        "relevance", Map.of("type", "string", "description", "Why this matters given the person's existing background")
                    ),
                    "required", List.of("headline", "signal", "suggestedAction", "relevance")
                )
            )
        ),
        "required", List.of("insights")
    );

    private final ImportedDocumentRepository importedDocumentRepository;
    private final GeminiClient geminiClient;

    private record InsightsPayload(List<CareerInsightDto> insights) {
    }

    public CareerInsightsResponse getWeeklyInsights(UUID userId) {
        List<String> profile = importedDocumentRepository.findAllByUserId(userId).stream()
            .filter(ImportedDocument::isIncludedInPlanning)
            .map(ImportedDocument::getTitle)
            .toList();

        String profileText = profile.isEmpty()
            ? "No specific background on file -- give broadly useful software/tech career signal."
            : String.join(", ", profile);

        String systemInstruction = "You are a career advisor. Using current, real, dated web/news sources, identify "
            + "3 to 5 notable CURRENT trends in the tech job market, in-demand certifications, or emerging technology "
            + "areas that would make this person more valuable or employable, given their known background. Ground "
            + "every insight in a specific, real, current signal (a real event, report, or hiring trend) -- never a "
            + "generic or evergreen claim. Be concrete and specific, not vague.";
        String userContent = "Person's known background/skills (from their saved notes): " + profileText;

        InsightsPayload payload = geminiClient.generateStructured(systemInstruction, userContent, RESPONSE_SCHEMA, InsightsPayload.class, true);
        return new CareerInsightsResponse(Instant.now(), payload.insights());
    }
}
