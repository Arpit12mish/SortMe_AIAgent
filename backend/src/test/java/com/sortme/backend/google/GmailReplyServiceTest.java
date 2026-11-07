package com.sortme.backend.google;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.crypto.TokenCipher;
import com.sortme.backend.imported.ImportedEmail;
import com.sortme.backend.imported.ImportedEmailRepository;
import com.sortme.backend.imported.SyncStatus;
import com.sortme.backend.user.User;
import com.sortme.backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class GmailReplyServiceTest {

    @Autowired
    private GmailReplyService replyService;
    @Autowired
    private ImportedEmailRepository emailRepository;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TokenCipher tokenCipher;

    @MockBean
    private GmailClient gmailClient;

    private Connection newGmailConnection(User user, String ownEmail) {
        Connection c = new Connection();
        c.setUserId(user.getId());
        c.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        c.setStatus(ConnectionStatus.CONNECTED);
        c.setExternalAccountLabel(ownEmail);
        c.setAccessTokenEnc(tokenCipher.encrypt("fake-access-token"));
        return connectionRepository.save(c);
    }

    private ImportedEmail newEmail(UUID userId, UUID connectionId, String threadId, Instant receivedAt) {
        ImportedEmail e = new ImportedEmail();
        e.setUserId(userId);
        e.setConnectionId(connectionId);
        e.setSourceId("msg-" + UUID.randomUUID());
        e.setThreadId(threadId);
        e.setReceivedAt(receivedAt);
        e.setSyncStatus(SyncStatus.SYNCED);
        return emailRepository.save(e);
    }

    private GmailClient.Thread threadWithLastMessageFrom(String threadId, String fromAddress, String dateHeader) {
        GmailClient.Part payload = new GmailClient.Part(null, null, null, List.of(
            new GmailClient.Header("From", fromAddress),
            new GmailClient.Header("Date", dateHeader),
            new GmailClient.Header("Subject", "Following up on my application")
        ));
        GmailClient.Message message = new GmailClient.Message("msg-last", threadId, "snippet", payload);
        return new GmailClient.Thread(threadId, List.of(message));
    }

    @Test
    void threadIsFlaggedWhenTheLastMessageIsNotFromTheConnectedAccount() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = newGmailConnection(user, "me@example.com");
        newEmail(user.getId(), connection.getId(), "thread-needs-reply", Instant.now());

        when(gmailClient.getThread(any(), eq("thread-needs-reply")))
            .thenReturn(threadWithLastMessageFrom("thread-needs-reply", "Recruiter <them@external.com>",
                "Mon, 01 Jan 2024 10:00:00 +0000"));

        List<NeedsReplyThreadDto> results = replyService.listNeedsReply(user.getId());

        assertThat(results).hasSize(1);
        assertThat(results.get(0).threadId()).isEqualTo("thread-needs-reply");
        assertThat(results.get(0).fromAddress()).isEqualTo("Recruiter <them@external.com>");
        assertThat(results.get(0).stale()).isTrue(); // 2024 is long past the 3-day threshold
    }

    @Test
    void threadIsNotFlaggedWhenTheConnectedAccountSentTheLastMessage() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = newGmailConnection(user, "me@example.com");
        newEmail(user.getId(), connection.getId(), "thread-already-replied", Instant.now());

        when(gmailClient.getThread(any(), eq("thread-already-replied")))
            .thenReturn(threadWithLastMessageFrom("thread-already-replied", "Me <me@example.com>",
                "Mon, 01 Jan 2024 10:00:00 +0000"));

        List<NeedsReplyThreadDto> results = replyService.listNeedsReply(user.getId());

        assertThat(results).isEmpty();
    }

    @Test
    void oneThreadFailingToFetchDoesNotDiscardTheOthers() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = newGmailConnection(user, "me@example.com");
        newEmail(user.getId(), connection.getId(), "thread-broken", Instant.now());
        newEmail(user.getId(), connection.getId(), "thread-ok", Instant.now().minusSeconds(60));

        when(gmailClient.getThread(any(), eq("thread-broken"))).thenThrow(new RuntimeException("Gmail unavailable"));
        when(gmailClient.getThread(any(), eq("thread-ok")))
            .thenReturn(threadWithLastMessageFrom("thread-ok", "them@external.com", "Mon, 01 Jan 2024 10:00:00 +0000"));

        List<NeedsReplyThreadDto> results = replyService.listNeedsReply(user.getId());

        assertThat(results).hasSize(1);
        assertThat(results.get(0).threadId()).isEqualTo("thread-ok");
    }
}
