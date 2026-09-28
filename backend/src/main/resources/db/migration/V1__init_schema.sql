-- SortMe backend schema: users, OAuth connections, and normalized imported
-- items from Google Docs, Gmail, and GitHub. Every table that holds
-- per-user data carries a user_id column; the application layer scopes
-- every query by it (see ConnectionRepository / Imported*Repository) and
-- isolation is covered by ConnectionServiceIsolationTest.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    install_id  VARCHAR(128) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- provider: GOOGLE_DOCS | GOOGLE_GMAIL | GITHUB
-- status:   CONNECTED | DISCONNECTED | ERROR | EXPIRED
CREATE TABLE connections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                VARCHAR(32) NOT NULL,
    status                  VARCHAR(32) NOT NULL,
    external_account_label  VARCHAR(255),
    granted_scopes          TEXT,
    access_token_enc        TEXT,
    refresh_token_enc       TEXT,
    token_expires_at        TIMESTAMPTZ,
    installation_id         VARCHAR(64),
    last_sync_at            TIMESTAMPTZ,
    last_sync_status        VARCHAR(32),
    last_sync_error         TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider)
);
CREATE INDEX idx_connections_user_id ON connections(user_id);

CREATE TABLE github_selected_repos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id    UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    repo_github_id   BIGINT NOT NULL,
    repo_full_name   VARCHAR(255) NOT NULL,
    is_private       BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, repo_full_name)
);

CREATE TABLE imported_documents (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id         UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    source_id             VARCHAR(255) NOT NULL,
    title                 VARCHAR(1024) NOT NULL,
    source_link           TEXT NOT NULL,
    modified_time         TIMESTAMPTZ,
    content_text          TEXT,
    included_in_planning  BOOLEAN NOT NULL DEFAULT true,
    sync_status           VARCHAR(32) NOT NULL,
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, source_id)
);
CREATE INDEX idx_imported_documents_user_id ON imported_documents(user_id);

CREATE TABLE imported_emails (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id         UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    source_id             VARCHAR(255) NOT NULL,
    thread_id             VARCHAR(255),
    subject               VARCHAR(1024),
    from_address          VARCHAR(512),
    received_at           TIMESTAMPTZ,
    snippet               TEXT,
    body_text             TEXT,
    included_in_planning  BOOLEAN NOT NULL DEFAULT true,
    sync_status           VARCHAR(32) NOT NULL,
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, source_id)
);
CREATE INDEX idx_imported_emails_user_id ON imported_emails(user_id);

-- item_type: ISSUE | PULL_REQUEST
CREATE TABLE imported_github_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id         UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    source_id             VARCHAR(255) NOT NULL,
    item_type             VARCHAR(32) NOT NULL,
    repo_full_name        VARCHAR(255) NOT NULL,
    title                 VARCHAR(1024) NOT NULL,
    url                   TEXT NOT NULL,
    state                 VARCHAR(32) NOT NULL,
    github_created_at     TIMESTAMPTZ,
    github_updated_at     TIMESTAMPTZ,
    github_closed_at      TIMESTAMPTZ,
    included_in_planning  BOOLEAN NOT NULL DEFAULT true,
    sync_status           VARCHAR(32) NOT NULL,
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, source_id)
);
CREATE INDEX idx_imported_github_items_user_id ON imported_github_items(user_id);

-- Minimal audit trail for security-sensitive actions (connect, disconnect,
-- sync, revoke). detail never contains token or message/document content.
CREATE TABLE audit_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type  VARCHAR(64) NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
