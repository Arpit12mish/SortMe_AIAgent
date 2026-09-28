package com.sortme.backend.connections;

import com.sortme.backend.audit.AuditService;
import com.sortme.backend.config.SortMeProperties;
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
import com.sortme.backend.security.PkceUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ConnectionService {

    private static final Logger log = LoggerFactory.getLogger(ConnectionService.class);

    private final ConnectionRepository connectionRepository;
    private final GitHubSelectedRepoRepository githubReposRepository;
    private final ImportedDocumentRepository importedDocumentRepository;
    private final ImportedEmailRepository importedEmailRepository;
    private final ImportedGitHubItemRepository importedGitHubItemRepository;

    private final OAuthStateService oauthStateService;
    private final TokenCipher tokenCipher;
    private final AuditService auditService;
    private final SortMeProperties properties;

    private final GoogleOAuthClient googleOAuthClient;
    private final GitHubUserOAuthClient gitHubUserOAuthClient;
    private final GitHubApiClient gitHubApiClient;

    public record StartResult(String authorizeUrl) {
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

    // ---- start / callback ----

    /** Both Google and the GitHub App's user-authorization flow redirect
     * here. One shared URL (registered once with each provider) is enough
     * because the signed `state` this backend minted at /start fully
     * identifies which SortMe user and which of the three providers a given
     * `code` belongs to -- see OAuthStateService. */
    private String oauthCallbackUrl() {
        return properties.getPublicBaseUrl() + "/api/connections/oauth-callback";
    }

    /**
     * Mints a fresh PKCE pair and a signed state (carrying the verifier) and
     * returns the provider's real authorize URL. The mobile app only opens
     * this in a browser and waits for our own redirect back to
     * `sortme://oauth-redirect` -- it never sees a code, a verifier, or a
     * token. See PkceUtil for why this leg is backend-driven rather than
     * client-driven.
     */
    public StartResult startOAuth(UUID userId, ConnectionProvider provider) {
        String codeVerifier = PkceUtil.generateVerifier();
        String codeChallenge = PkceUtil.challengeFor(codeVerifier);
        String state = oauthStateService.issue(userId, provider, codeVerifier);
        String callback = oauthCallbackUrl();

        String authorizeUrl = switch (provider) {
            case GOOGLE_DOCS -> googleOAuthClient.buildAuthorizeUrl(GoogleScopes.DOCS, state, codeChallenge, callback);
            case GOOGLE_GMAIL -> googleOAuthClient.buildAuthorizeUrl(GoogleScopes.GMAIL, state, codeChallenge, callback);
            case GITHUB -> gitHubUserOAuthClient.buildAuthorizeUrl(state, codeChallenge, callback);
        };
        auditService.record(userId, "OAUTH_START", "provider=" + provider);
        return new StartResult(authorizeUrl);
    }

    /**
     * Handles the provider's redirect back to this backend: validates
     * `state`, exchanges `code` for tokens, stores them, and returns the
     * `sortme://oauth-redirect` URL the caller (OAuthCallbackController)
     * should 302 the browser to next. Never throws -- any failure becomes
     * an `result=error` redirect instead, since there is no JSON caller to
     * hand an exception to at this point in the flow.
     */
    @Transactional
    public String completeOAuthCallback(String code, String state, String providerError) {
        if (providerError != null) {
            log.warn("OAuth provider returned an error: {}", providerError);
            return errorRedirect("provider_denied");
        }
        if (code == null || state == null) {
            return errorRedirect("missing_code_or_state");
        }

        OAuthStateService.Claims claims;
        try {
            claims = oauthStateService.parse(state);
        } catch (InvalidOAuthStateException e) {
            log.warn("Rejected OAuth callback with invalid state: {}", e.getMessage());
            return errorRedirect("invalid_state");
        }

        try {
            Connection connection = connectionRepository.findByUserIdAndProvider(claims.userId(), claims.provider())
                .orElseGet(() -> {
                    Connection c = new Connection();
                    c.setUserId(claims.userId());
                    c.setProvider(claims.provider());
                    return c;
                });

            if (claims.provider() == ConnectionProvider.GITHUB) {
                GitHubTokenResponse tokens = gitHubUserOAuthClient.exchangeCode(code, claims.codeVerifier(), oauthCallbackUrl());
                GitHubUserOAuthClient.GitHubUser user = gitHubUserOAuthClient.getAuthenticatedUser(tokens.accessToken());
                connection.setAccessTokenEnc(tokenCipher.encrypt(tokens.accessToken()));
                connection.setRefreshTokenEnc(tokens.refreshToken() != null ? tokenCipher.encrypt(tokens.refreshToken()) : null);
                connection.setTokenExpiresAt(tokens.expiresInSeconds() != null ? Instant.now().plusSeconds(tokens.expiresInSeconds()) : null);
                connection.setExternalAccountLabel(user != null ? user.login() : null);
                connection.setGrantedScopes("github-app-user-auth");
            } else {
                String scope = claims.provider() == ConnectionProvider.GOOGLE_DOCS ? GoogleScopes.DOCS : GoogleScopes.GMAIL;
                GoogleTokenResponse tokens = googleOAuthClient.exchangeCode(code, claims.codeVerifier(), oauthCallbackUrl());
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
            auditService.record(claims.userId(), "OAUTH_CONNECTED", "provider=" + claims.provider());
            return successRedirect(claims.provider());
        } catch (Exception e) {
            log.warn("OAuth exchange failed for provider {}: {}", claims.provider(), e.getMessage());
            auditService.record(claims.userId(), "OAUTH_FAILED", "provider=" + claims.provider());
            return errorRedirect("exchange_failed");
        }
    }

    private String successRedirect(ConnectionProvider provider) {
        return UriComponentsBuilder.fromUriString(properties.getOauthRedirectUri())
            .queryParam("provider", provider.name())
            .queryParam("result", "connected")
            .build()
            .toUriString();
    }

    private String errorRedirect(String reason) {
        return UriComponentsBuilder.fromUriString(properties.getOauthRedirectUri())
            .queryParam("result", "error")
            .queryParam("reason", reason)
            .build()
            .toUriString();
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
