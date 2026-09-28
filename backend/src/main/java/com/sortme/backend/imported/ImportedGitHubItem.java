package com.sortme.backend.imported;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "imported_github_items")
@Getter
@Setter
@NoArgsConstructor
public class ImportedGitHubItem {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "connection_id", nullable = false)
    private UUID connectionId;

    /** "{owner/repo}#{number}", unique within a connection. */
    @Column(name = "source_id", nullable = false)
    private String sourceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false, length = 32)
    private GitHubItemType itemType;

    @Column(name = "repo_full_name", nullable = false)
    private String repoFullName;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String url;

    @Column(nullable = false, length = 32)
    private String state;

    @Column(name = "github_created_at")
    private Instant githubCreatedAt;

    @Column(name = "github_updated_at")
    private Instant githubUpdatedAt;

    @Column(name = "github_closed_at")
    private Instant githubClosedAt;

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
