package com.sortme.backend.google;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionService;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.imported.ImportedDocument;
import com.sortme.backend.imported.ImportedDocumentRepository;
import com.sortme.backend.imported.SyncStatus;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GoogleDocsSyncService {

    private static final Logger log = LoggerFactory.getLogger(GoogleDocsSyncService.class);

    private final ConnectionService connectionService;
    private final ImportedDocumentRepository repository;
    private final GoogleDriveClient driveClient;

    /**
     * Imports (or re-imports) exactly the files the user selected in the
     * Picker -- never a broader listing. Called once right after the
     * Picker returns file ids, and again on manual refresh with the same
     * previously-selected ids.
     *
     * <p>Each file is fetched and saved independently: one file failing
     * (revoked access mid-batch, a transient Drive error) does not discard
     * the files that already succeeded in the same call.
     */
    @Transactional
    public List<ImportedDocument> importSelectedFiles(UUID userId, List<String> fileIds) {
        Connection connection = connectionService.findForSync(userId, ConnectionProvider.GOOGLE_DOCS)
            .orElseThrow(() -> new NotFoundException("Google Docs is not connected"));
        String accessToken = connectionService.getValidAccessToken(connection);

        List<ImportedDocument> results = new ArrayList<>();
        List<String> failures = new ArrayList<>();
        for (String fileId : fileIds) {
            try {
                results.add(syncOne(userId, connection.getId(), accessToken, fileId));
            } catch (Exception e) {
                log.warn("Failed to import Google Doc {}: {}", fileId, e.getMessage());
                failures.add(fileId);
            }
        }

        boolean allFailed = !fileIds.isEmpty() && results.isEmpty();
        String error = failures.isEmpty() ? null : failures.size() + " of " + fileIds.size() + " document(s) failed to import";
        connectionService.recordSyncResult(connection.getId(), !allFailed, error);
        return results;
    }

    private ImportedDocument syncOne(UUID userId, UUID connectionId, String accessToken, String fileId) {
        GoogleDriveClient.DriveFileMeta meta = driveClient.getMeta(accessToken, fileId);
        String content = driveClient.getTextContent(accessToken, meta);

        ImportedDocument doc = repository.findByConnectionIdAndSourceId(connectionId, fileId)
            .orElseGet(ImportedDocument::new);
        doc.setUserId(userId);
        doc.setConnectionId(connectionId);
        doc.setSourceId(fileId);
        doc.setTitle(meta.name());
        doc.setSourceLink(meta.webViewLink());
        doc.setModifiedTime(meta.modifiedTime() != null ? Instant.parse(meta.modifiedTime()) : null);
        doc.setContentText(content);
        doc.setSyncStatus(SyncStatus.SYNCED);
        doc.setLastSyncedAt(Instant.now());
        return repository.save(doc);
    }
}
