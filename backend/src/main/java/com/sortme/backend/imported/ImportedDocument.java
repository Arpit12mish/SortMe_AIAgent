package com.sortme.backend.imported;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "imported_documents")
@Getter
@Setter
@NoArgsConstructor
public class ImportedDocument {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "connection_id", nullable = false)
    private UUID connectionId;

    /** Google Drive file id. */
    @Column(name = "source_id", nullable = false)
    private String sourceId;

    @Column(nullable = false)
    private String title;

    @Column(name = "source_link", nullable = false)
    private String sourceLink;

    @Column(name = "modified_time")
    private Instant modifiedTime;

    /** Plain-text export of the document, size-capped by the sync service. */
    @Column(name = "content_text")
    private String contentText;

    @Column(name = "included_in_planning", nullable = false)
    private boolean includedInPlanning = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "sync_status", nullable = false, length = 32)
    private SyncStatus syncStatus;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
