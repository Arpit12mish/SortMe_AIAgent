package com.sortme.backend.imported;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "imported_emails")
@Getter
@Setter
@NoArgsConstructor
public class ImportedEmail {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "connection_id", nullable = false)
    private UUID connectionId;

    /** Gmail message id. */
    @Column(name = "source_id", nullable = false)
    private String sourceId;

    @Column(name = "thread_id")
    private String threadId;

    @Column
    private String subject;

    @Column(name = "from_address")
    private String fromAddress;

    @Column(name = "received_at")
    private Instant receivedAt;

    @Column
    private String snippet;

    /** Size-capped plain-text body, kept only because the review UI needs it. */
    @Column(name = "body_text")
    private String bodyText;

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
