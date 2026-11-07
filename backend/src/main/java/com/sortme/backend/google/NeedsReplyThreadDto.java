package com.sortme.backend.google;

import java.time.Instant;

public record NeedsReplyThreadDto(
    String threadId,
    String subject,
    String fromAddress,
    Instant lastMessageAt,
    Integer daysSinceLastMessage,
    boolean stale,
    String link
) {
}
