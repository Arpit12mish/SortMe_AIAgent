package com.sortme.backend.ai;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
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
class EmailTaskExtractionAiServiceTest {

    @Autowired
    private EmailTaskExtractionAiService service;
    @Autowired
    private ImportedEmailRepository emailRepository;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;

    @MockBean
    private GeminiClient geminiClient;

    @Test
    void hallucinatedSourceEmailIdDropsTheCitationButKeepsTheTask() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);

        ImportedEmail email = new ImportedEmail();
        email.setUserId(user.getId());
        email.setConnectionId(connection.getId());
        email.setSourceId("msg-1");
        email.setSubject("Offer letter - Acme Corp");
        email.setBodyText("Please confirm by Friday.");
        email.setReceivedAt(Instant.now());
        email.setSyncStatus(SyncStatus.SYNCED);
        email = emailRepository.save(email);

        List<EmailTaskExtractionAiService.RawTask> rawTasks = List.of(
            new EmailTaskExtractionAiService.RawTask("Confirm offer", "2026-10-10", "high", email.getId().toString()),
            new EmailTaskExtractionAiService.RawTask("Hallucinated task", null, "low", "not-a-real-email-id")
        );
        when(geminiClient.generateStructured(any(), any(), any(), eq(EmailTaskExtractionAiService.TasksPayload.class)))
            .thenReturn(new EmailTaskExtractionAiService.TasksPayload(rawTasks));

        ExtractTasksResponse response = service.extractTasks(user.getId());

        assertThat(response.tasks()).hasSize(2);
        assertThat(response.tasks().get(0).sourceEmailSubject()).isEqualTo("Offer letter - Acme Corp");
        assertThat(response.tasks().get(1).title()).isEqualTo("Hallucinated task");
        assertThat(response.tasks().get(1).sourceEmailSubject()).isNull(); // citation dropped, not trusted
    }

    @Test
    void anUnparsableSuggestedDueDateIsDroppedRatherThanForwarded() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);

        ImportedEmail email = new ImportedEmail();
        email.setUserId(user.getId());
        email.setConnectionId(connection.getId());
        email.setSourceId("msg-2");
        email.setSubject("Reminder");
        email.setReceivedAt(Instant.now());
        email.setSyncStatus(SyncStatus.SYNCED);
        email = emailRepository.save(email);

        when(geminiClient.generateStructured(any(), any(), any(), eq(EmailTaskExtractionAiService.TasksPayload.class)))
            .thenReturn(new EmailTaskExtractionAiService.TasksPayload(List.of(
                new EmailTaskExtractionAiService.RawTask("Follow up", "next Friday", "medium", email.getId().toString())
            )));

        ExtractTasksResponse response = service.extractTasks(user.getId());

        assertThat(response.tasks()).hasSize(1);
        assertThat(response.tasks().get(0).suggestedDueDate()).isNull();
    }
}
