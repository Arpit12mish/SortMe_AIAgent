package com.sortme.backend.ai;

import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.imported.ImportedDocument;
import com.sortme.backend.imported.ImportedDocumentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class StudyQuestionAiService {

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
        "type", "object",
        "properties", Map.of(
            "questions", Map.of(
                "type", "array",
                "items", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "question", Map.of("type", "string"),
                        "answer", Map.of("type", "string")
                    ),
                    "required", List.of("question", "answer")
                )
            )
        ),
        "required", List.of("questions")
    );

    private final ImportedDocumentRepository importedDocumentRepository;
    private final GeminiClient geminiClient;

    record QuestionsPayload(List<GeneratedQuestionDto> questions) {
    }

    /** Reads the FULL stored document text (not the imported-items API's
     * 280-char preview) so generated questions are grounded in the whole
     * note, not a fragment. */
    public GenerateQuestionsResponse generateQuestions(UUID userId, UUID importedDocumentId, int count) {
        ImportedDocument doc = importedDocumentRepository.findByIdAndUserId(importedDocumentId, userId)
            .orElseThrow(() -> new NotFoundException("Imported document not found"));

        String content = doc.getContentText();
        if (content == null || content.isBlank()) {
            return new GenerateQuestionsResponse(doc.getTitle(), content, List.of());
        }

        String systemInstruction = "You are helping a user revise from their own notes. Given the following "
            + "document, generate exactly " + count + " question-and-answer study pairs grounded strictly in "
            + "this text -- do not invent facts not present in the document. Prefer questions that test "
            + "understanding, not just recall of isolated phrases.";
        String userContent = "Document title: " + doc.getTitle() + "\n\n" + content;

        QuestionsPayload payload = geminiClient.generateStructured(systemInstruction, userContent, RESPONSE_SCHEMA, QuestionsPayload.class);
        return new GenerateQuestionsResponse(doc.getTitle(), content, payload.questions());
    }
}
