package com.sortme.backend.ai;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.exception.NotFoundException;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class StudyQuestionAiServiceTest {

    @Autowired
    private StudyQuestionAiService service;
    @Autowired
    private ImportedDocumentRepository documentRepository;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;

    @MockBean
    private GeminiClient geminiClient;

    private ImportedDocument newDocument(UUID userId, UUID connectionId, String content) {
        ImportedDocument doc = new ImportedDocument();
        doc.setUserId(userId);
        doc.setConnectionId(connectionId);
        doc.setSourceId("drive-file-" + UUID.randomUUID());
        doc.setTitle("AIML notes");
        doc.setSourceLink("https://docs.google.com/document/d/x");
        doc.setModifiedTime(Instant.now());
        doc.setContentText(content);
        doc.setSyncStatus(SyncStatus.SYNCED);
        doc.setLastSyncedAt(Instant.now());
        return documentRepository.save(doc);
    }

    @Test
    void readsTheFullStoredContentNotAPreviewAndMapsGeminiQuestionsThrough() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_DOCS);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);

        String fullContent = "A".repeat(1000); // well past the old 280-char preview cap
        ImportedDocument doc = newDocument(user.getId(), connection.getId(), fullContent);

        List<GeneratedQuestionDto> questions = List.of(
            new GeneratedQuestionDto("What is a neuron?", "A basic computational unit."),
            new GeneratedQuestionDto("What is backpropagation?", "Gradient-based weight update.")
        );
        when(geminiClient.generateStructured(any(), any(), any(), eq(StudyQuestionAiService.QuestionsPayload.class)))
            .thenReturn(new StudyQuestionAiService.QuestionsPayload(questions));

        GenerateQuestionsResponse response = service.generateQuestions(user.getId(), doc.getId(), 2);

        assertThat(response.documentTitle()).isEqualTo("AIML notes");
        assertThat(response.documentContentText()).isEqualTo(fullContent); // the full text, not truncated
        assertThat(response.questions()).hasSize(2);
        assertThat(response.questions().get(0).question()).isEqualTo("What is a neuron?");

        // The full content, not a preview, must be what was actually sent to Gemini.
        verify(geminiClient).generateStructured(any(), eq("Document title: AIML notes\n\n" + fullContent), any(), eq(StudyQuestionAiService.QuestionsPayload.class));
    }

    @Test
    void emptyDocumentContentSkipsTheGeminiCallEntirely() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_DOCS);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);
        ImportedDocument doc = newDocument(user.getId(), connection.getId(), null);

        GenerateQuestionsResponse response = service.generateQuestions(user.getId(), doc.getId(), 5);

        assertThat(response.questions()).isEmpty();
        verifyNoInteractions(geminiClient);
    }

    @Test
    void rejectsADocumentThatDoesNotBelongToTheRequestingUser() {
        User owner = userRepository.save(new User("install-" + UUID.randomUUID()));
        User other = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(owner.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_DOCS);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection = connectionRepository.save(connection);
        ImportedDocument doc = newDocument(owner.getId(), connection.getId(), "secret notes");

        assertThatThrownBy(() -> service.generateQuestions(other.getId(), doc.getId(), 5))
            .isInstanceOf(NotFoundException.class);
        verify(geminiClient, never()).generateStructured(any(), any(), any(), any());
    }
}
