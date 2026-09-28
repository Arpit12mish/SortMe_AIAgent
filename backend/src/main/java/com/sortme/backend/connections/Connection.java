package com.sortme.backend.connections;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "connections")
@Getter
@Setter
@NoArgsConstructor
public class Connection {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ConnectionProvider provider;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ConnectionStatus status;

    /** e.g. the connected Google email or GitHub login -- never the raw token. */
    @Column(name = "external_account_label")
    private String externalAccountLabel;

    @Column(name = "granted_scopes")
    private String grantedScopes;

    @Column(name = "access_token_enc")
    private String accessTokenEnc;

    @Column(name = "refresh_token_enc")
    private String refreshTokenEnc;

    @Column(name = "token_expires_at")
    private Instant tokenExpiresAt;

    /** GitHub App installation id; unused for Google providers. */
    @Column(name = "installation_id")
    private String installationId;

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(name = "last_sync_status", length = 32)
    private String lastSyncStatus;

    @Column(name = "last_sync_error")
    private String lastSyncError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
