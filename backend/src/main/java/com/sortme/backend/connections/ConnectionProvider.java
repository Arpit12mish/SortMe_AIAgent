package com.sortme.backend.connections;

/** Independently connectable data sources. Google Docs and Gmail are
 * deliberately separate providers (not just separate scopes on one
 * "GOOGLE" row) so each can be connected, synced, and disconnected without
 * affecting the other. */
public enum ConnectionProvider {
    GOOGLE_DOCS,
    GOOGLE_GMAIL,
    GITHUB
}
