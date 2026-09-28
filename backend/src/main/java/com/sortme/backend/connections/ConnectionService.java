package com.sortme.backend.connections;

import com.sortme.backend.audit.AuditService;
import com.sortme.backend.crypto.TokenCipher;
import com.sortme.backend.exception.InvalidOAuthStateException;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.exception.ProviderErrorException;
import com.sortme.backend.github.GitHubApiClient;
import com.sortme.backend.github.GitHubTokenResponse;
import com.sortme.backend.github.GitHubUserOAuthClient;
import com.sortme.backend.google.GoogleOAuthClient;
import com.sortme.backend.google.GoogleScopes;
import com.sortme.backend.google.GoogleTokenResponse;
import com.sortme.backend.imported.ImportedDocumentRepository;
import com.sortme.backend.imported.ImportedEmailRepository;
import com.sortme.backend.imported.ImportedGitHubItemRepository;
import com.sortme.backend.security.OAuthStateService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ConnectionService {

    private final ConnectionRepository connectionRepository;
    private final GitHubSelectedRepoRepository githubReposRepository;
    private final ImportedDocumentRepository importedDocumentRepository;
    private final ImportedEmailRepository importedEmailRepository;
    private final ImportedGitHubItemRepository importedGitHubItemRepository;

    private final OAuthStateService oauthStateService;
    private final TokenCipher tokenCipher;
    private final AuditService auditService;

    private final GoogleOAuthClient googleOAuthClient;
    private final GitHubUserOAuthClient gitHubUserOAuthClient;
    private final GitHubApiClient gitHubApiClient;

    public record StartResult(String authorizeUrl, String state) {
    }

    // ---- listing ----

    @Transactional(readOnly = true)
    public List<ConnectionDto> listConnections(UUID userId) {
        return List.of(ConnectionProvider.values()).stream()
            .map(provider -> connectionRepository.findByUserIdAndProvider(userId, provider)
                .map(this::toDto)
                .orElse(ConnectionDto.disconnected(provider)))
            .toList();
    }

    private ConnectionDto toDto(Connection c) {
        List<String> repos = c.getProvider() == ConnectionProvider.GITHUB
            ? githubReposRepository.findAllByConnectionId(c.getId()).stream().map(GitHubSelectedRepo::getRepoFullName).toList()
            : List.of();
        return new ConnectionDto(
            c.getProvider(), c.getStatus(), c.getExternalAccountLabel(), c.getGrantedScopes(),
            c.getInstallationId() != null, repos, c.getLastSyncAt(), c.getLastSyncStatus(), c.getLastSyncError()
        );
    }

    // ---- start / exchange ----

    public StartResult startOAuth(UUID userId, ConnectionProvider provider, String codeChallenge) {
        String state = oauthStateService.issue(userId, provider);
        String authorizeUrl = switch (provider) {
            case GOOGLE_DOCS -> googleOAuthClient.buildAuthorizeUrl(GoogleScopes.DOCS, state, codeChallenge);
            case GOOGLE_GMAIL -> googleOAuthClient.buildAuthorizeUrl(GoogleScopes.GMAIL, state, codeChallenge);
            case GITHUB -> gitHubUserOAuthClient.buildAuthorizeUrl(state, codeChallenge);
        };
        auditService.record(userId, "OAUTH_START", "provider=" + provider);
        return new StartResult(authorizeUrl, state);
    }

    @Transactional
    public ConnectionDto exchangeOAuth(UUID userId, ConnectionProvider provider, String code, String codeVerifier, String state) {
        oauthStateService.validate(state, userId, provider);

        Connection connection = connectionRepository.findByUserIdAndProvider(userId, provider)
            .orElseGet(() -> {
                Connection c = new Connection();
                c.setUserId(userId);
                c.setProvider(provider);
                return c;
            });

        if (provider == ConnectionProvider.GITHUB) {
            GitHubTokenResponse tokens = gitHubUserOAuthClient.exchangeCode(code, codeVerifier);
            GitHubUserOAuthClient.GitHubUser user = gitHubUserOAuthClient.getAuthenticatedUser(tokens.accessToken());
            connection.setAccessTokenEnc(tokenCipher.encrypt(tokens.accessToken()));
            connection.setRefreshTokenEnc(tokens.refreshToken() != null ? tokenCipher.encrypt(tokens.refreshToken()) : null);
            connection.setTokenExpiresAt(tokens.expiresInSeconds() != null ? Instant.now().plusSeconds(tokens.expiresInSeconds()) : null);
            connection.setExternalAccountLabel(user != null ? user.login() : null);
            connection.setGrantedScopes("github-app-user-auth");
        } else {
            String scope = provider == ConnectionProvider.GOOGLE_DOCS ? GoogleScopes.DOCS : GoogleScopes.GMAIL;
            GoogleTokenResponse tokens = googleOAuthClient.exchangeCode(code, codeVerifier);
            connection.setAccessTokenEnc(tokenCipher.encrypt(tokens.accessToken()));
            if (tokens.refreshToken() != null) {
                connection.setRefreshTokenEnc(tokenCipher.encrypt(tokens.refreshToken()));
            }
            connection.setTokenExpiresAt(tokens.expiresInSeconds() != null ? Instant.now().plusSeconds(tokens.expiresInSeconds()) : null);
            connection.setExternalAccountLabel(tokens.idToken() != null ? googleOAuthClient.extractEmail(tokens.idToken()) : connection.getExternalAccountLabel());
            connection.setGrantedScopes(scope);
        }

        connection.setStatus(ConnectionStatus.CONNECTED);
        connection.setLastSyncError(null);
        connectionRepository.save(connection);
        auditService.record(userId, "OAUTH_CONNECTED", "provider=" + provider);
        return toDto(connection);
    }

    // ---- GitHub App installation linking ----

    @Transactional
    public ConnectionDto linkGitHubInstallation(UUID userId, String installationId) {
        Connection connection = connectionRepository.findByUserIdAndProvider(userId, ConnectionProvider.GITHUB)
            .orElseThrow(() -> new NotFoundException("Connect your GitHub account before selecting repositories"));
        if (connection.getExternalAccountLabel() == null) {
            throw new NotFoundException("GitHub account not yet identified; complete sign-in before selecting repositories");
        }

        GitHubApiClient.Installation installation = gitHubApiClient.getInstallation(installationId);
        if (installation == null || installation.account() == null
            || !connection.getExternalAccountLabel().equalsIgnoreCase(installation.account().login())) {
            // Prevents linking an installation_id that doesn't belong to the
            // GitHub account this SortMe user already authenticated as.
            throw new InvalidOAuthStateException("This installation does not belong to the connected GitHub account");
        }

        connection.setInstallationId(installationId);
        connection.setStatus(ConnectionStatus.CONNECTED);
        connectionRepository.save(connection);

        String installationToken = gitHubApiClient.mintInstallationToken(installationId);
        List<GitHubApiClient.Repo> repos = gitHubApiClient.listInstallationRepositories(installationToken);
        githubReposRepository.deleteAllByConnectionId(connection.getId());
        for (GitHubApiClient.Repo repo : repos) {
            GitHubSelectedRepo row = new GitHubSelectedRepo();
            row.setConnectionId(connection.getId());
            row.setRepoGithubId(repo.id());
            row.setRepoFullName(repo.fullName());
            row.setPrivate(repo.isPrivate());
            githubReposRepository.save(row);
        }

        auditService.record(userId, "GITHUB_INSTALLATION_LINKED", "repoCount=" + repos.size());
        return toDto(connection);
    }

    // ---- disconnect ----

    @Transactional
    public void disconnect(UUID userId, ConnectionProvider provider, boolean deleteImportedData) {
        Connection connection = connectionRepository.findByUserIdAndProvider(userId, provider).orElse(null);
        if (connection == null) {
            return; // already disconnected; disconnect is idempotent
        }

        String accessToken = decryptOrNull(connection.getAccessTokenEnc());
        try {
            if (provider == ConnectionProvider.GITHUB && accessToken != null) {
                gitHubUserOAuthClient.revokeGrant(accessToken);
            } else if (accessToken != null) {
                googleOAuthClient.revoke(accessToken);
            }
        } catch (Exception e) {
            // Best-effort: local disconnect must still succeed even if the
            // provider is unreachable or the token was already revoked.
        }

        connection.setStatus(ConnectionStatus.DISCONNECTED);
        connection.setAccessTokenEnc(null);
        connection.setRefreshTokenEnc(null);
        connection.setTokenExpiresAt(null);
        connection.setInstallationId(null);
        connection.setLastSyncError(null);
        connectionRepository.save(connection);
        githubReposRepository.deleteAllByConnectionId(connection.getId());

        if (deleteImportedData) {
            importedDocumentRepository.deleteAllByConnectionId(connection.getId());
            importedEmailRepository.deleteAllByConnectionId(connection.getId());
            importedGitHubItemRepository.deleteAllByConnectionId(connection.getId());
        }

        auditService.record(userId, "DISCONNECTED", "provider=" + provider + " deletedImportedData=" + deleteImportedData);
    }

    // ---- token access for sync services ----

    /** Returns a usable access token, refreshing first if it's expired (or
     * about to be) and a refresh token is available. Marks the connection
     * EXPIRED and throws if refresh fails or none is available. */
    @Transactional
    public String getValidAccessToken(Connection connection) {
        boolean nearExpiry = connection.getTokenExpiresAt() != null
            && connection.getTokenExpiresAt().isBefore(Instant.now().plusSeconds(60));
        if (!nearExpiry) {
            return decryptOrNull(connection.getAccessTokenEnc());
        }

        String refreshToken = decryptOrNull(connection.getRefreshTokenEnc());
        if (refreshToken == null) {
            connection.setStatus(ConnectionStatus.EXPIRED);
            connectionRepository.save(connection);
            throw new ProviderErrorException("Access token expired and no refresh token is available; reconnect required", false, true);
        }

        try {
            if (connection.getProvider() == ConnectionProvider.GITHUB) {
                GitHubTokenResponse tokens = gitHubUserOAuthClient.refresh(refreshToken);
                connection.setAccessTokenEnc(tokenCipher.encrypt(tokens.accessToken()));
                if (tokens.refreshToken() != null) connection.setRefreshTokenEnc(tokenCipher.encrypt(tokens.refreshToken()));
                connection.setTokenExpiresAt(tokens.expiresInSeconds() != null ? Instant.now().plusSeconds(tokens.expiresInSeconds()) : null);
            } else {
                GoogleTokenResponse tokens = googleOAuthClient.refresh(refreshToken);
                connection.setAccessTokenEnc(tokenCipher.encrypt(tokens.accessToken()));
                connection.setTokenExpiresAt(tokens.expiresInSeconds() != null ? Instant.now().plusSeconds(tokens.expiresInSeconds()) : null);
            }
            connection.setStatus(ConnectionStatus.CONNECTED);
            connectionRepository.save(connection);
            return decryptOrNull(connection.getAccessTokenEnc());
        } catch (ProviderErrorException e) {
            if (e.isRequiresReconnect()) {
                connection.setStatus(ConnectionStatus.EXPIRED);
                connection.setLastSyncError(e.getMessage());
                connectionRepository.save(connection);
            }
            throw e;
        }
    }

    public Optional<Connection> findForSync(UUID userId, ConnectionProvider provider) {
        return connectionRepository.findByUserIdAndProvider(userId, provider)
            .filter(c -> c.getStatus() == ConnectionStatus.CONNECTED);
    }

    @Transactional
    public void recordSyncResult(UUID connectionId, boolean success, String error) {
        connectionRepository.findById(connectionId).ifPresent(c -> {
            c.setLastSyncAt(Instant.now());
            c.setLastSyncStatus(success ? "SUCCESS" : "ERROR");
            c.setLastSyncError(error);
            connectionRepository.save(c);
        });
    }

    private String decryptOrNull(String enc) {
        return enc == null ? null : tokenCipher.decrypt(enc);
    }
}
