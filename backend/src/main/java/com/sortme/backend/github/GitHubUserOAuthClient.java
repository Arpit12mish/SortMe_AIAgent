package com.sortme.backend.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.exception.ProviderErrorException;
import com.sortme.backend.exception.ProviderNotConfiguredException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The user-to-server OAuth leg of the GitHub App: identifies which GitHub
 * account connected (for the Connections screen label) via PKCE, same
 * pattern as Google. Repository read access itself comes from the App's
 * *installation* token (GitHubApiClient), not this user token.
 */
@Component
@RequiredArgsConstructor
public class GitHubUserOAuthClient {

    private static final String AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
    private static final String TOKEN_URL = "https://github.com/login/oauth/access_token";

    private final SortMeProperties properties;
    private final RestClient restClient = RestClient.create();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GitHubUser(String login, @JsonProperty("avatar_url") String avatarUrl) {
    }

    private void requireConfigured() {
        SortMeProperties.GitHub github = properties.getGithub();
        if (github.getClientId() == null || github.getClientId().isBlank()
            || github.getClientSecret() == null || github.getClientSecret().isBlank()) {
            throw new ProviderNotConfiguredException("GitHub App");
        }
    }

    /** `redirectUri` is this backend's own HTTPS callback (registered as the
     * App's "User authorization callback URL") -- see GoogleOAuthClient's
     * buildAuthorizeUrl for why a custom scheme isn't used directly. */
    public String buildAuthorizeUrl(String state, String codeChallenge, String redirectUri) {
        requireConfigured();
        return UriComponentsBuilder.fromUriString(AUTHORIZE_URL)
            .queryParam("client_id", properties.getGithub().getClientId())
            .queryParam("redirect_uri", redirectUri)
            .queryParam("state", state)
            .queryParam("code_challenge", codeChallenge)
            .queryParam("code_challenge_method", "S256")
            .build()
            .toUriString();
    }

    public GitHubTokenResponse exchangeCode(String code, String codeVerifier, String redirectUri) {
        requireConfigured();
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", properties.getGithub().getClientId());
        form.add("client_secret", properties.getGithub().getClientSecret());
        form.add("code", code);
        form.add("code_verifier", codeVerifier);
        form.add("redirect_uri", redirectUri);
        return post(form);
    }

    public GitHubTokenResponse refresh(String refreshToken) {
        requireConfigured();
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", properties.getGithub().getClientId());
        form.add("client_secret", properties.getGithub().getClientSecret());
        form.add("refresh_token", refreshToken);
        form.add("grant_type", "refresh_token");
        return post(form);
    }

    private GitHubTokenResponse post(MultiValueMap<String, String> form) {
        // GitHub answers OAuth errors with HTTP 200 and an `error` field
        // rather than a 4xx status, so we must inspect the body either way.
        GitHubTokenResponse response = restClient.post()
            .uri(TOKEN_URL)
            .header("Accept", "application/json")
            .body(form)
            .retrieve()
            .body(GitHubTokenResponse.class);
        if (response == null || response.accessToken() == null) {
            String reason = response != null ? response.errorDescription() : "empty response";
            boolean invalidGrant = response != null && "bad_verification_code".equals(response.error());
            throw new ProviderErrorException("GitHub token request failed: " + reason, !invalidGrant, invalidGrant);
        }
        return response;
    }

    public GitHubUser getAuthenticatedUser(String userAccessToken) {
        try {
            return restClient.get()
                .uri("https://api.github.com/user")
                .header("Authorization", "Bearer " + userAccessToken)
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .body(GitHubUser.class);
        } catch (RestClientResponseException e) {
            throw new ProviderErrorException("Failed to load GitHub user profile: " + e.getStatusCode(), e, true, false);
        }
    }

    /** Revokes the whole OAuth grant for this app + user (all tokens). */
    public void revokeGrant(String userAccessToken) {
        try {
            String basicAuth = java.util.Base64.getEncoder().encodeToString(
                (properties.getGithub().getClientId() + ":" + properties.getGithub().getClientSecret())
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)
            );
            restClient.method(org.springframework.http.HttpMethod.DELETE)
                .uri("https://api.github.com/applications/{client_id}/grant", properties.getGithub().getClientId())
                .header("Authorization", "Basic " + basicAuth)
                .header("Accept", "application/vnd.github+json")
                .body(java.util.Map.of("access_token", userAccessToken))
                .retrieve()
                .toBodilessEntity();
        } catch (RestClientResponseException e) {
            // Already revoked -- nothing actionable, local disconnect still proceeds.
        }
    }
}
