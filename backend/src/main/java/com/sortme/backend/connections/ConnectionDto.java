package com.sortme.backend.connections;

import java.time.Instant;
import java.util.List;

public record ConnectionDto(
    ConnectionProvider provider,
    ConnectionStatus status,
    String externalAccountLabel,
    String grantedScopes,
    boolean installed,
    List<String> selectedRepos,
    Instant lastSyncAt,
    String lastSyncStatus,
    String lastSyncError
) {
    public static ConnectionDto disconnected(ConnectionProvider provider) {
        return new ConnectionDto(provider, ConnectionStatus.DISCONNECTED, null, null, false, List.of(), null, null, null);
    }
}
