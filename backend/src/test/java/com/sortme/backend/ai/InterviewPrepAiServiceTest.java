package com.sortme.backend.ai;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.imported.ImportedDocument;
import com.sortme.backend.imported.ImportedDocumentRepository;
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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class InterviewPrepAiServiceTest {

    @Autowired
    private InterviewPrepAiService service;
    @Autowired
    private ImportedDocumentRepository documentRepository;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;

    @MockBean
    private GeminiClient geminiClient;

    private ImportedDocument newDocument(UUID userId, UUID connectionId, String title) {
        ImportedDocument doc = new ImportedDocument();
        doc.setUserId(userId);
        doc.setConnectionId(connectionId);
        doc.setSourceId("drive-" + UUID.randomUUID());
        doc.setTitle(title);
        doc.setSourceLink("https://docs.google.com/document/d/x");
        doc.setModifiedTime(Instant.now());
        doc.setSyncStatus(SyncStatus.SYNCED);
        return documentRepository.save(doc);
    }

    @Test
    void hallucinatedDocumentIdsAreDroppedAndTitlesAreNeverTrustedFromGemini() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_DOCS);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);

        ImportedDocument realDoc = newDocument(user.getId(), connection.getId(), "Android APP+Kotlin");

        List<InterviewPrepAiService.RawPriority> raw = List.of(
            new InterviewPrepAiService.RawPriority(realDoc.getId().toString(), "Matches the Android role", 1),
            new InterviewPrepAiService.RawPriority(UUID.randomUUID().toString(), "Invented reason", 2)
        );
        when(geminiClient.generateStructured(any(), any(), any(), eq(InterviewPrepAiService.PrioritiesPayload.class)))
            .thenReturn(new InterviewPrepAiService.PrioritiesPayload("Android interview detected", raw));

        PrepPrioritiesResponse response = service.prioritize(user.getId(), "Android role");

        assertThat(response.interviewContext()).isEqualTo("Android interview detected");
        assertThat(response.prioritizedNotes()).hasSize(1);
        assertThat(response.prioritizedNotes().get(0).importedDocumentId()).isEqualTo(realDoc.getId().toString());
        assertThat(response.prioritizedNotes().get(0).title()).isEqualTo("Android APP+Kotlin"); // from the server map, not Gemini
    }

    @Test
    void noDocumentsSkipsTheGeminiCallEntirely() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));

        PrepPrioritiesResponse response = service.prioritize(user.getId(), null);

        assertThat(response.prioritizedNotes()).isEmpty();
        verifyNoInteractions(geminiClient);
    }
}
