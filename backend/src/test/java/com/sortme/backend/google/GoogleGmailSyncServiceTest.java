package com.sortme.backend.google;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.crypto.TokenCipher;
import com.sortme.backend.imported.ImportedEmail;
import com.sortme.backend.imported.ImportedEmailRepository;
import com.sortme.backend.user.User;
import com.sortme.backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class GoogleGmailSyncServiceTest {

    @Autowired
    private GoogleGmailSyncService service;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private ImportedEmailRepository emailRepository;
    @Autowired
    private TokenCipher tokenCipher;

    @MockBean
    private GmailClient gmailClient;

    private Connection newGmailConnection(User user) {
        Connection c = new Connection();
        c.setUserId(user.getId());
        c.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        c.setStatus(ConnectionStatus.CONNECTED);
        c.setExternalAccountLabel("me@example.com");
        c.setAccessTokenEnc(tokenCipher.encrypt("fake-access-token"));
        return connectionRepository.save(c);
    }

    private GmailClient.Message fakeMessage(String id) {
        GmailClient.Part payload = new GmailClient.Part(null, null, null, List.of(
            new GmailClient.Header("Subject", "Subject " + id),
            new GmailClient.Header("From", "them@example.com")
        ));
        return new GmailClient.Message(id, "thread-" + id, "snippet", payload);
    }

    @Test
    void defaultsToARolling30DayWindowWhenNoRangeOrTermsAreGiven() {
        String query = GoogleGmailSyncService.buildQuery(new GoogleGmailSyncService.SyncRequest(null, null, null));
        assertThat(query).isEqualTo("newer_than:30d");
    }

    @Test
    void aUserSuppliedRangeOverridesTheDefaultWindow() {
        String query = GoogleGmailSyncService.buildQuery(
            new GoogleGmailSyncService.SyncRequest(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "interview")
        );
        assertThat(query).isEqualTo("after:2026/01/01 before:2026/02/01 (interview)");
    }

    @Test
    void followsPaginationAcrossMultiplePagesAndImportsEveryMessage() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        newGmailConnection(user);

        when(gmailClient.listMessageIds(any(), any(), eq(50), isNull()))
            .thenReturn(new GmailClient.ListResponse(
                List.of(new GmailClient.MessageRef("msg-1", "thread-1"), new GmailClient.MessageRef("msg-2", "thread-2")),
                "page-2-token"
            ));
        when(gmailClient.listMessageIds(any(), any(), eq(50), eq("page-2-token")))
            .thenReturn(new GmailClient.ListResponse(
                List.of(new GmailClient.MessageRef("msg-3", "thread-3")),
                null
            ));
        when(gmailClient.getMessage(any(), eq("msg-1"))).thenReturn(fakeMessage("msg-1"));
        when(gmailClient.getMessage(any(), eq("msg-2"))).thenReturn(fakeMessage("msg-2"));
        when(gmailClient.getMessage(any(), eq("msg-3"))).thenReturn(fakeMessage("msg-3"));

        List<ImportedEmail> results = service.sync(user.getId(), new GoogleGmailSyncService.SyncRequest(null, null, null));

        assertThat(results).hasSize(3);
        assertThat(results.stream().map(ImportedEmail::getSourceId)).containsExactlyInAnyOrder("msg-1", "msg-2", "msg-3");
    }

    @Test
    void stopsPaginatingOnceTheOverallMessageCapIsReached() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        newGmailConnection(user);

        // Every page (including the 4th) reports a further next-page token,
        // as if Gmail had still more to give -- without the MAX_MESSAGES_TOTAL
        // cap this would paginate forever. 4 pages of 50 reaches exactly 200.
        for (int page = 0; page < 4; page++) {
            List<GmailClient.MessageRef> refs = new java.util.ArrayList<>();
            for (int i = 0; i < 50; i++) {
                refs.add(new GmailClient.MessageRef("page" + page + "-msg" + i, "thread"));
            }
            String requestToken = page == 0 ? null : "token-" + page;
            String nextToken = "token-" + (page + 1);
            when(gmailClient.listMessageIds(any(), any(), eq(50), requestToken == null ? isNull() : eq(requestToken)))
                .thenReturn(new GmailClient.ListResponse(refs, nextToken));
        }
        when(gmailClient.getMessage(any(), any())).thenAnswer(inv -> fakeMessage(inv.getArgument(1)));

        List<ImportedEmail> results = service.sync(user.getId(), new GoogleGmailSyncService.SyncRequest(null, null, null));

        assertThat(results).hasSize(200);
        org.mockito.Mockito.verify(gmailClient, org.mockito.Mockito.never()).listMessageIds(any(), any(), eq(50), eq("token-4"));
    }

    @Test
    void reSyncingTheSameMessageUpdatesTheExistingRowInsteadOfDuplicatingIt() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        newGmailConnection(user);

        when(gmailClient.listMessageIds(any(), any(), eq(50), isNull()))
            .thenReturn(new GmailClient.ListResponse(List.of(new GmailClient.MessageRef("msg-dup", "thread-dup")), null));
        when(gmailClient.getMessage(any(), eq("msg-dup"))).thenReturn(fakeMessage("msg-dup"));

        service.sync(user.getId(), new GoogleGmailSyncService.SyncRequest(null, null, null));
        service.sync(user.getId(), new GoogleGmailSyncService.SyncRequest(null, null, null));

        List<ImportedEmail> stored = emailRepository.findAllByUserId(user.getId());
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getSourceId()).isEqualTo("msg-dup");
    }

    @Test
    void oneFailingMessageDoesNotDiscardTheOthersInTheSamePage() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        newGmailConnection(user);

        when(gmailClient.listMessageIds(any(), any(), eq(50), isNull()))
            .thenReturn(new GmailClient.ListResponse(
                List.of(new GmailClient.MessageRef("msg-broken", "t"), new GmailClient.MessageRef("msg-ok", "t")), null
            ));
        when(gmailClient.getMessage(any(), eq("msg-broken"))).thenThrow(new RuntimeException("Gmail unavailable"));
        when(gmailClient.getMessage(any(), eq("msg-ok"))).thenReturn(fakeMessage("msg-ok"));

        List<ImportedEmail> results = service.sync(user.getId(), new GoogleGmailSyncService.SyncRequest(null, null, null));

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getSourceId()).isEqualTo("msg-ok");
    }
}
