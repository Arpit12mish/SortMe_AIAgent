package com.sortme.backend.ai;

import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.google.GmailClient;
import com.sortme.backend.google.GmailReplyService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GmailReplyAiService {

    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
        "type", "object",
        "properties", Map.of(
            "subject", Map.of("type", "string"),
            "body", Map.of("type", "string")
        ),
        "required", List.of("subject", "body")
    );

    private final GmailReplyService gmailReplyService;
    private final GeminiClient geminiClient;

    record DraftPayload(String subject, String body) {
    }

    /** Re-fetches the live thread for grounding (never trusts cached/synced
     * content for a draft) and derives `to` server-side from the thread's
     * correspondent, not from Gemini. */
    public DraftReplyDto draftReply(UUID userId, String threadId) {
        GmailClient.Thread thread = gmailReplyService.getThreadMessages(userId, threadId);
        if (thread == null || thread.messages() == null || thread.messages().isEmpty()) {
            throw new NotFoundException("Email thread not found");
        }

        GmailClient.Message last = thread.messages().get(thread.messages().size() - 1);
        String to = extractAddress(GmailClient.header(last, "From"));
        String subject = GmailClient.header(last, "Subject");

        StringBuilder sb = new StringBuilder();
        for (GmailClient.Message message : thread.messages()) {
            String from = GmailClient.header(message, "From");
            String body = message.payload() != null ? GmailClient.extractPlainText(message.payload()) : null;
            sb.append("From: ").append(from).append('\n')
                .append(body != null ? body : "(no plain-text body)").append("\n---\n");
        }

        String systemInstruction = "Draft a brief, professional reply to the last message in this email thread. "
            + "The user is job-searching; match their existing tone from prior messages in the thread if present. "
            + "Keep it concise.";
        String userContent = "Subject: " + subject + "\n\n" + sb;

        DraftPayload payload = geminiClient.generateStructured(systemInstruction, userContent, RESPONSE_SCHEMA, DraftPayload.class);
        return new DraftReplyDto(to, payload.subject(), payload.body());
    }

    private String extractAddress(String fromHeader) {
        if (fromHeader == null) return null;
        int start = fromHeader.indexOf('<');
        int end = fromHeader.indexOf('>');
        if (start >= 0 && end > start) {
            return fromHeader.substring(start + 1, end).trim();
        }
        return fromHeader.trim();
    }
}
