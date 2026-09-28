package com.sortme.backend.google;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionService;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.imported.ImportedEmail;
import com.sortme.backend.imported.ImportedEmailRepository;
import com.sortme.backend.imported.SyncStatus;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GoogleGmailSyncService {

    private static final Logger log = LoggerFactory.getLogger(GoogleGmailSyncService.class);
    private static final DateTimeFormatter GMAIL_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    /** Bounds a single sync so a wide date range can't pull in thousands of
     * messages (and their bodies) in one call. */
    private static final int MAX_MESSAGES = 50;

    private final ConnectionService connectionService;
    private final ImportedEmailRepository repository;
    private final GmailClient gmailClient;

    public record SyncRequest(LocalDate from, LocalDate to, String searchTerms) {
    }

    /** Builds a bounded Gmail search query from a user-chosen date range and
     * optional free-text terms -- never an unbounded "import everything". */
    public static String buildQuery(SyncRequest request) {
        StringBuilder q = new StringBuilder();
        if (request.from() != null) q.append("after:").append(request.from().format(GMAIL_DATE)).append(' ');
        if (request.to() != null) q.append("before:").append(request.to().plusDays(1).format(GMAIL_DATE)).append(' ');
        if (request.searchTerms() != null && !request.searchTerms().isBlank()) {
            q.append('(').append(request.searchTerms().trim()).append(')');
        }
        String query = q.toString().trim();
        return query.isEmpty() ? "newer_than:30d" : query;
    }

    /** One message failing to fetch/parse does not discard the messages
     * that already succeeded in the same sync call -- see
     * GoogleDocsSyncService#importSelectedFiles for the same pattern. */
    @Transactional
    public List<ImportedEmail> sync(UUID userId, SyncRequest request) {
        Connection connection = connectionService.findForSync(userId, ConnectionProvider.GOOGLE_GMAIL)
            .orElseThrow(() -> new NotFoundException("Gmail is not connected"));
        String accessToken = connectionService.getValidAccessToken(connection);
        String query = buildQuery(request);

        GmailClient.ListResponse listed = gmailClient.listMessageIds(accessToken, query, MAX_MESSAGES);
        List<GmailClient.MessageRef> refs = listed.messages() != null ? listed.messages() : List.of();

        List<ImportedEmail> results = new ArrayList<>();
        int failureCount = 0;
        for (GmailClient.MessageRef ref : refs) {
            try {
                results.add(syncOne(userId, connection.getId(), accessToken, ref.id()));
            } catch (Exception e) {
                log.warn("Failed to import Gmail message {}: {}", ref.id(), e.getMessage());
                failureCount++;
            }
        }

        boolean allFailed = !refs.isEmpty() && results.isEmpty();
        String error = failureCount == 0 ? null : failureCount + " of " + refs.size() + " message(s) failed to import";
        connectionService.recordSyncResult(connection.getId(), !allFailed, error);
        return results;
    }

    private ImportedEmail syncOne(UUID userId, UUID connectionId, String accessToken, String messageId) {
        GmailClient.Message message = gmailClient.getMessage(accessToken, messageId);

        ImportedEmail email = repository.findByConnectionIdAndSourceId(connectionId, messageId)
            .orElseGet(ImportedEmail::new);
        email.setUserId(userId);
        email.setConnectionId(connectionId);
        email.setSourceId(messageId);
        email.setThreadId(message.threadId());
        email.setSubject(GmailClient.header(message, "Subject"));
        email.setFromAddress(GmailClient.header(message, "From"));
        String dateHeader = GmailClient.header(message, "Date");
        email.setReceivedAt(parseDateHeader(dateHeader));
        email.setSnippet(message.snippet());
        email.setBodyText(message.payload() != null ? GmailClient.extractPlainText(message.payload()) : null);
        email.setSyncStatus(SyncStatus.SYNCED);
        email.setLastSyncedAt(Instant.now());
        return repository.save(email);
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
