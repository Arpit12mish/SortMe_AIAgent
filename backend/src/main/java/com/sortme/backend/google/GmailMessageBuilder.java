package com.sortme.backend.google;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Hand-builds a plain-text RFC 2822 message for Gmail's raw-send API --
 * no mail library needed for a reply with just To/Subject/body and basic
 * threading headers. */
public final class GmailMessageBuilder {

    private GmailMessageBuilder() {
    }

    /** `inReplyToMessageId`/`referencesHeader` come from the thread's last
     * message so the sent reply lands in the same Gmail thread with
     * correct client-side threading, not just the same `threadId`. */
    public static String buildRawReply(String from, String to, String subject, String bodyText,
                                        String inReplyToMessageId, String referencesHeader) {
        StringBuilder sb = new StringBuilder();
        if (from != null && !from.isBlank()) {
            sb.append("From: ").append(sanitizeHeaderValue(from)).append("\r\n");
        }
        sb.append("To: ").append(sanitizeHeaderValue(to)).append("\r\n");
        sb.append("Subject: ").append(encodeSubject(subject)).append("\r\n");
        if (inReplyToMessageId != null && !inReplyToMessageId.isBlank()) {
            sb.append("In-Reply-To: ").append(sanitizeHeaderValue(inReplyToMessageId)).append("\r\n");
            String references = (referencesHeader != null && !referencesHeader.isBlank())
                ? referencesHeader + " " + inReplyToMessageId
                : inReplyToMessageId;
            sb.append("References: ").append(sanitizeHeaderValue(references)).append("\r\n");
        }
        sb.append("Content-Type: text/plain; charset=\"UTF-8\"\r\n");
        sb.append("MIME-Version: 1.0\r\n");
        sb.append("\r\n");
        sb.append(bodyText != null ? bodyText : "");

        return Base64.getUrlEncoder().encodeToString(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** Headers must never carry a raw CR/LF (header injection) -- strip them. */
    private static String sanitizeHeaderValue(String value) {
        return value.replaceAll("[\\r\\n]", " ").trim();
    }

    private static String encodeSubject(String subject) {
        String safe = sanitizeHeaderValue(subject != null ? subject : "");
        // RFC 2047 encoded-word so a non-ASCII subject survives intact.
        String base64 = Base64.getEncoder().encodeToString(safe.getBytes(StandardCharsets.UTF_8));
        return "=?UTF-8?B?" + base64 + "?=";
    }
}
