package com.sortme.backend.connections;

public enum ConnectionStatus {
    CONNECTED,
    DISCONNECTED,
    /** Token exists but the provider rejected it (revoked, invalid_grant). */
    ERROR,
    /** Access token expired and no refresh token is available to renew it. */
    EXPIRED
}
