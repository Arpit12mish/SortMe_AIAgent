package com.sortme.backend.google;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.crypto.TokenCipher;
import com.sortme.backend.imported.ImportedDocument;
import com.sortme.backend.imported.ImportedDocumentRepository;
import com.sortme.backend.user.User;
import com.sortme.backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * One item failing mid-batch must not discard the items that already
 * succeeded in the same sync call (item 8: "partial sync failure").
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class GoogleDocsSyncServicePartialFailureTest {

    @Autowired
    private GoogleDocsSyncService syncService;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private ImportedDocumentRepository documentRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TokenCipher tokenCipher;

    @MockBean
    private GoogleDriveClient driveClient;

    @Test
    void oneFileFailingDoesNotDiscardFilesThatAlreadySucceeded() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_DOCS);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection.setAccessTokenEnc(tokenCipher.encrypt("fake-access-token"));
        connection = connectionRepository.save(connection);

        var goodMeta = new GoogleDriveClient.DriveFileMeta("good-file", "Good doc", "application/vnd.google-apps.document", "https://drive/good", "2026-01-01T00:00:00Z");
        when(driveClient.getMeta(any(), eq("good-file"))).thenReturn(goodMeta);
        when(driveClient.getTextContent(any(), eq(goodMeta))).thenReturn("some text");
        when(driveClient.getMeta(any(), eq("bad-file"))).thenThrow(new RuntimeException("Drive API unavailable"));

        List<ImportedDocument> results = syncService.importSelectedFiles(user.getId(), List.of("good-file", "bad-file"));

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getSourceId()).isEqualTo("good-file");
        assertThat(documentRepository.findAllByUserId(user.getId())).hasSize(1);

        Connection reloaded = connectionRepository.findById(connection.getId()).orElseThrow();
        assertThat(reloaded.getLastSyncStatus()).isEqualTo("SUCCESS"); // partial success still counts as success
        assertThat(reloaded.getLastSyncError()).contains("1 of 2");
    }

    @Test
    void allFilesFailingIsReportedAsAFailedSync() {
        User user = userRepository.save(new User("install-" + UUID.randomUUID()));
        Connection connection = new Connection();
        connection.setUserId(user.getId());
        connection.setProvider(ConnectionProvider.GOOGLE_DOCS);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connection.setAccessTokenEnc(tokenCipher.encrypt("fake-access-token"));
        connection = connectionRepository.save(connection);

        when(driveClient.getMeta(any(), any())).thenThrow(new RuntimeException("Drive API unavailable"));

        List<ImportedDocument> results = syncService.importSelectedFiles(user.getId(), List.of("bad-file-1"));

        assertThat(results).isEmpty();
        Connection reloaded = connectionRepository.findById(connection.getId()).orElseThrow();
        assertThat(reloaded.getLastSyncStatus()).isEqualTo("ERROR");
    }
}
