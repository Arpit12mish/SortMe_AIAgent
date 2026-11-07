package com.sortme.backend.google;

import com.sortme.backend.audit.AuditService;
import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionService;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.exception.ProviderErrorException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** The one write path in this feature set that performs a real, external,
 * irreversible action -- sending an email. Every caller must have already
 * shown the user the exact final text and gotten an explicit confirmation;
 * this service does not re-confirm anything itself. */
@Service
@RequiredArgsConstructor
public class GmailSendService {

    private final GmailReplyService gmailReplyService;
    private final ConnectionService connectionService;
    private final GmailClient gmailClient;
    private final AuditService auditService;

    public record SendReplyRequest(String threadId, String to, String subject, String body) {
    }

    public record SendReplyResponse(String messageId, String threadId) {
    }

    @Transactional
    public SendReplyResponse sendReply(UUID userId, SendReplyRequest request) {
        Connection connection = gmailReplyService.requireConnection(userId);
        String scopes = connection.getGrantedScopes();
        if (scopes == null || !scopes.contains("gmail.send")) {
            throw new ProviderErrorException(
                "Gmail send is not authorized; reconnect Gmail to enable sending", false, true);
        }

        // Re-fetches live rather than trusting any client-supplied
        // threading info, for the real Message-ID to thread correctly.
        GmailClient.Thread thread = gmailReplyService.getThreadMessages(userId, request.threadId());
        if (thread == null || thread.messages() == null || thread.messages().isEmpty()) {
            throw new NotFoundException("Email thread not found");
        }
        GmailClient.Message last = thread.messages().get(thread.messages().size() - 1);
        String messageIdHeader = GmailClient.header(last, "Message-ID");
        String referencesHeader = GmailClient.header(last, "References");

        String accessToken = connectionService.getValidAccessToken(connection);
        String raw = GmailMessageBuilder.buildRawReply(
            connection.getExternalAccountLabel(), request.to(), request.subject(), request.body(),
            messageIdHeader, referencesHeader
        );

        GmailClient.SendResult result = gmailClient.sendMessage(accessToken, raw, request.threadId());
        auditService.record(userId, "GMAIL_REPLY_SENT", "threadId=" + request.threadId());
        return new SendReplyResponse(result.id(), result.threadId());
    }
}
