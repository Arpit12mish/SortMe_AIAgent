package com.sortme.backend.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.sortme.backend.exception.ProviderErrorException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Instant;
import java.util.List;

/** App-installation-scoped calls: minting an installation access token and
 * reading the repos/issues it grants read access to. Never touches a
 * user's own OAuth token. */
@Component
@RequiredArgsConstructor
public class GitHubApiClient {

    private static final String API_BASE = "https://api.github.com";

    private final GitHubAppJwtService appJwtService;
    private final RestClient restClient = RestClient.create();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record InstallationTokenResponse(@JsonProperty("token") String token, @JsonProperty("expires_at") String expiresAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Repo(long id, @JsonProperty("full_name") String fullName, @JsonProperty("private") boolean isPrivate) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RepositoriesResponse(List<Repo> repositories) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PullRequestMarker(String url) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Account(String login) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Installation(long id, Account account) {
    }

    /** Used to verify, before linking an installation_id to a SortMe user,
     * that it actually belongs to the GitHub account that user already
     * authenticated as -- otherwise a guessed/enumerated installation_id
     * could be linked to the wrong user. See ConnectionService#linkGitHubInstallation. */
    public Installation getInstallation(String installationId) {
        try {
            return restClient.get()
                .uri(API_BASE + "/app/installations/{id}", installationId)
                .header("Authorization", "Bearer " + appJwtService.mintAppJwt())
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .body(Installation.class);
        } catch (RestClientResponseException e) {
            throw new ProviderErrorException("Failed to look up GitHub installation: " + e.getStatusCode(), e, false, false);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Issue(
        long number,
        String title,
        @JsonProperty("html_url") String htmlUrl,
        String state,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt,
        @JsonProperty("closed_at") Instant closedAt,
        @JsonProperty("pull_request") PullRequestMarker pullRequest
    ) {
        public boolean isPullRequest() {
            return pullRequest != null;
        }
    }

    public String mintInstallationToken(String installationId) {
        try {
            InstallationTokenResponse response = restClient.post()
                .uri(API_BASE + "/app/installations/{id}/access_tokens", installationId)
                .header("Authorization", "Bearer " + appJwtService.mintAppJwt())
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .body(InstallationTokenResponse.class);
            return response != null ? response.token() : null;
        } catch (RestClientResponseException e) {
            boolean revoked = e.getStatusCode().value() == 404 || e.getStatusCode().value() == 401;
            throw new ProviderErrorException("Failed to mint GitHub installation token: " + e.getStatusCode(), e, !revoked, revoked);
        }
    }

    public List<Repo> listInstallationRepositories(String installationToken) {
        try {
            RepositoriesResponse response = restClient.get()
                .uri(API_BASE + "/installation/repositories?per_page=100")
                .header("Authorization", "Bearer " + installationToken)
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .body(RepositoriesResponse.class);
            return response != null && response.repositories() != null ? response.repositories() : List.of();
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    /** GitHub's /issues endpoint returns both issues and PRs; PRs carry a
     * non-null `pull_request` field, which the caller uses to classify. */
    public List<Issue> listIssuesAndPullRequests(String installationToken, String repoFullName) {
        try {
            Issue[] issues = restClient.get()
                .uri(API_BASE + "/repos/{repo}/issues?state=all&per_page=100&sort=updated&direction=desc", repoFullName)
                .header("Authorization", "Bearer " + installationToken)
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .body(Issue[].class);
            return issues != null ? List.of(issues) : List.of();
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    private ProviderErrorException providerError(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        boolean rateLimited = status == 403 && e.getResponseHeaders() != null
            && "0".equals(e.getResponseHeaders().getFirst("X-RateLimit-Remaining"));
        boolean requiresReconnect = status == 401 || status == 404;
        return new ProviderErrorException("GitHub API request failed: " + status, e, rateLimited, requiresReconnect);
    }
}
