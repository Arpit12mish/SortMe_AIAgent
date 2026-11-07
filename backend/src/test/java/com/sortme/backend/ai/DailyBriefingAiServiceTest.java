package com.sortme.backend.ai;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.exception.ValidationException;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DailyBriefingAiServiceTest {

    @Autowired
    private DailyBriefingAiService service;
    @Autowired
    private ImportedEmailRepository emailRepository;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;

    @MockBean
    private GeminiClient geminiClient;

    private User newUser() {
        return userRepository.save(new User("install-" + UUID.randomUUID()));
    }

    private ImportedEmail newEmail(UUID userId, UUID connectionId, String subject) {
        ImportedEmail e = new ImportedEmail();
        e.setUserId(userId);
        e.setConnectionId(connectionId);
        e.setSourceId("msg-" + UUID.randomUUID());
        e.setSubject(subject);
        e.setBodyText("We'd like to schedule your interview.");
        e.setReceivedAt(Instant.now());
        e.setSyncStatus(SyncStatus.SYNCED);
        return emailRepository.save(e);
    }

    @Test
    void rejectsAnEmptyTranscriptWithNoSourcesWithoutCallingGemini() {
        User user = newUser();
        assertThatThrownBy(() -> service.analyze(user.getId(), "   ", false, false))
            .isInstanceOf(ValidationException.class);
        verifyNoInteractions(geminiClient);
    }

    @Test
    void anEmptyTranscriptIsAllowedWhenGmailContextIsIncludedForAStandaloneInboxScan() {
        User user = newUser();
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);
        newEmail(user.getId(), connection.getId(), "Interview invite - Acme Corp");

        when(geminiClient.generateStructured(any(), any(), any(), eq(DailyBriefingAiService.BriefingPayload.class)))
            .thenReturn(new DailyBriefingAiService.BriefingPayload("Found an interview invite", List.of(), List.of(), List.of()));

        DailyBriefingResponse response = service.analyze(user.getId(), "", true, false);

        assertThat(response.summary()).isEqualTo("Found an interview invite");
    }

    @Test
    void rejectsAnOverlongTranscriptWithoutCallingGemini() {
        User user = newUser();
        String huge = "a".repeat(8001);
        assertThatThrownBy(() -> service.analyze(user.getId(), huge, false, false))
            .isInstanceOf(ValidationException.class);
        verifyNoInteractions(geminiClient);
    }

    @Test
    void hallucinatedSourceEmailIdDropsTheCitationButKeepsTheTask() {
        User user = newUser();
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);
        ImportedEmail email = newEmail(user.getId(), connection.getId(), "Offer letter - Acme Corp");

        List<DailyBriefingAiService.RawTaskSuggestion> rawTasks = List.of(
            new DailyBriefingAiService.RawTaskSuggestion("Prepare system design", 60, "2026-10-26", "high", email.getId().toString()),
            new DailyBriefingAiService.RawTaskSuggestion("Hallucinated task", 30, null, "low", "not-a-real-email-id")
        );
        when(geminiClient.generateStructured(any(), any(), any(), eq(DailyBriefingAiService.BriefingPayload.class)))
            .thenReturn(new DailyBriefingAiService.BriefingPayload("Prepping for an interview", rawTasks, List.of(), List.of()));

        DailyBriefingResponse response = service.analyze(user.getId(), "Tomorrow I have an interview at 2pm", true, false);

        assertThat(response.tasks()).hasSize(2);
        assertThat(response.tasks().get(0).sourceEmailSubject()).isEqualTo("Offer letter - Acme Corp");
        assertThat(response.tasks().get(1).sourceEmailSubject()).isNull();
    }

    @Test
    void anInterviewMissingEitherDateOrTimeIsAlwaysMarkedUncertainRegardlessOfWhatGeminiSaid() {
        User user = newUser();
        DailyBriefingAiService.RawInterviewSuggestion raw = new DailyBriefingAiService.RawInterviewSuggestion(
            "Acme Corp", "Backend Engineer", null, "2026-10-26", null, null, false, null, null
        );
        when(geminiClient.generateStructured(any(), any(), any(), eq(DailyBriefingAiService.BriefingPayload.class)))
            .thenReturn(new DailyBriefingAiService.BriefingPayload("summary", List.of(), List.of(raw), List.of()));

        DailyBriefingResponse response = service.analyze(user.getId(), "Interview with Acme tomorrow", false, false);

        assertThat(response.interviews()).hasSize(1);
        assertThat(response.interviews().get(0).dateTimeUncertain()).isTrue();
    }

    @Test
    void anUnparsableInterviewDateIsDroppedRatherThanForwarded() {
        User user = newUser();
        DailyBriefingAiService.RawInterviewSuggestion raw = new DailyBriefingAiService.RawInterviewSuggestion(
            "Acme Corp", "Backend Engineer", null, "next Monday", "14:00", "PST", false, null, null
        );
        when(geminiClient.generateStructured(any(), any(), any(), eq(DailyBriefingAiService.BriefingPayload.class)))
            .thenReturn(new DailyBriefingAiService.BriefingPayload("summary", List.of(), List.of(raw), List.of()));

        DailyBriefingResponse response = service.analyze(user.getId(), "Interview with Acme next Monday at 2pm", false, false);

        assertThat(response.interviews().get(0).date()).isNull();
        assertThat(response.interviews().get(0).dateTimeUncertain()).isTrue();
    }

    @Test
    void anInvalidPriorityFallsBackToMedium() {
        User user = newUser();
        DailyBriefingAiService.RawTaskSuggestion raw = new DailyBriefingAiService.RawTaskSuggestion("Do a thing", 30, null, "critical", null);
        when(geminiClient.generateStructured(any(), any(), any(), eq(DailyBriefingAiService.BriefingPayload.class)))
            .thenReturn(new DailyBriefingAiService.BriefingPayload("summary", List.of(raw), List.of(), List.of()));

        DailyBriefingResponse response = service.analyze(user.getId(), "I need to do a thing", false, false);

        assertThat(response.tasks().get(0).priority()).isEqualTo("medium");
    }

    @Test
    void doesNotIncludeEmailContextWhenIncludeGmailIsFalse() {
        User user = newUser();
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_GMAIL);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);
        newEmail(user.getId(), connection.getId(), "Should not be sent");

        when(geminiClient.generateStructured(any(), any(), any(), eq(DailyBriefingAiService.BriefingPayload.class)))
            .thenReturn(new DailyBriefingAiService.BriefingPayload("summary", List.of(), List.of(), List.of()));

        service.analyze(user.getId(), "Just a transcript, no email check", false, false);

        verify(geminiClient).generateStructured(any(), org.mockito.ArgumentMatchers.argThat(
            (String content) -> !content.contains("Should not be sent")
        ), any(), eq(DailyBriefingAiService.BriefingPayload.class));
    }
}
