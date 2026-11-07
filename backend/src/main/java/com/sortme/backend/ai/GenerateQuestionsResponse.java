package com.sortme.backend.ai;

import java.util.List;

/** `documentContentText` deliberately echoes the full note text back to the
 * client -- a scoped exception to the imported-items API's usual 280-char
 * preview, so the resulting local Note isn't a stub next to manually
 * written ones. It's always the requesting user's own document. */
public record GenerateQuestionsResponse(String documentTitle, String documentContentText, List<GeneratedQuestionDto> questions) {
}
