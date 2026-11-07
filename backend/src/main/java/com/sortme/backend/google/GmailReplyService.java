package com.sortme.backend.google;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionService;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.imported.ImportedEmail;
import com.sortme.backend.imported.ImportedEmailRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Computes which email threads are awaiting the user's reply -- always
 * live from Gmail, never persisted, since this is fundamentally a "check
 * current state" query (see GmailReplyAiService for drafting, and
 * GmailSendService for actually sending). */
@Service
@RequiredArgsConstructor
public class GmailReplyService {

    private static final Logger log = LoggerFactory.getLogger(GmailReplyService.class);

    /** Bounds how many threads get a live Gmail fetch per call. */
    private static final int MAX_THREADS = 30;
    private static final int STALE_AFTER_DAYS = 3;

    private final ConnectionService connectionService;
    private final ImportedEmailRepository importedEmailRepository;
    private final GmailClient gmailClient;

    public List<NeedsReplyThreadDto> listNeedsReply(UUID userId) {
        Connection connection = connectionService.findForSync(userId, ConnectionProvider.GOOGLE_GMAIL)
            .orElseThrow(() -> new NotFoundException("Gmail is not connected"));
        String accessToken = connectionService.getValidAccessToken(connection);

        List<String> threadIds = recentThreadIds(userId);

        List<NeedsReplyThreadDto> results = new ArrayList<>();
        for (String threadId : threadIds) {
            try {
                GmailClient.Thread thread = gmailClient.getThread(accessToken, threadId);
                evaluateThread(connection, thread).ifPresent(results::add);
            } catch (Exception e) {
                log.warn("Failed to inspect Gmail thread {}: {}", threadId, e.getMessage());
            }
        }
        return results;
    }

    /** Exposed for GmailReplyAiService / GmailSendService so they re-fetch
     * the live thread for grounding/threading instead of trusting anything
     * the client sent. */
    public GmailClient.Thread getThreadMessages(UUID userId, String threadId) {
        Connection connection = connectionService.findForSync(userId, ConnectionProvider.GOOGLE_GMAIL)
            .orElseThrow(() -> new NotFoundException("Gmail is not connected"));
        String accessToken = connectionService.getValidAccessToken(connection);
        return gmailClient.getThread(accessToken, threadId);
    }

    public Connection requireConnection(UUID userId) {
        return connectionService.findForSync(userId, ConnectionProvider.GOOGLE_GMAIL)
            .orElseThrow(() -> new NotFoundException("Gmail is not connected"));
    }

    private List<String> recentThreadIds(UUID userId) {
        Set<String> seen = new LinkedHashSet<>();
        importedEmailRepository.findAllByUserId(userId).stream()
            .filter(ImportedEmail::isIncludedInPlanning)
            .filter(e -> e.getThreadId() != null)
            .sorted(Comparator.comparing(ImportedEmail::getReceivedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .forEach(e -> seen.add(e.getThreadId()));
        return seen.stream().limit(MAX_THREADS).toList();
    }

    private java.util.Optional<NeedsReplyThreadDto> evaluateThread(Connection connection, GmailClient.Thread thread) {
        if (thread == null || thread.messages() == null || thread.messages().isEmpty()) {
            return java.util.Optional.empty();
        }
        GmailClient.Message last = thread.messages().get(thread.messages().size() - 1);
        String fromHeader = GmailClient.header(last, "From");
        if (fromHeader != null && isOwnAddress(connection, fromHeader)) {
            // The connected account sent the most recent message -- already replied.
            return java.util.Optional.empty();
        }

        Instant lastMessageAt = parseDateHeader(GmailClient.header(last, "Date"));
        Integer daysSince = lastMessageAt != null
            ? (int) Duration.between(lastMessageAt, Instant.now()).toDays()
            : null;
        boolean stale = daysSince != null && daysSince >= STALE_AFTER_DAYS;

        String subject = GmailClient.header(last, "Subject");
        String link = "https://mail.google.com/mail/u/0/#all/" + thread.id();

        return java.util.Optional.of(new NeedsReplyThreadDto(thread.id(), subject, fromHeader, lastMessageAt, daysSince, stale, link));
    }

    /** Heuristic, documented tradeoff: the `From` header is typically
     * "Name &lt;address&gt;"; the connection's label is just the address.
     * A case-insensitive substring match is good enough for the common
     * single-personal-account case this app targets. */
    private boolean isOwnAddress(Connection connection, String fromHeader) {
        String own = connection.getExternalAccountLabel();
        if (own == null || own.isBlank()) return false;
        return fromHeader.toLowerCase().contains(own.toLowerCase());
    }

    private Instant parseDateHeader(String value) {
        if (value == null) return null;
        try {
            return java.time.OffsetDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
        } catch (Exception e) {
            return null;
        }
    }
}
