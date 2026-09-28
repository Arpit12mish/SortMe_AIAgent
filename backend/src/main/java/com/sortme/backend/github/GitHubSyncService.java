package com.sortme.backend.github;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionService;
import com.sortme.backend.connections.GitHubSelectedRepo;
import com.sortme.backend.connections.GitHubSelectedRepoRepository;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.imported.GitHubItemType;
import com.sortme.backend.imported.ImportedGitHubItem;
import com.sortme.backend.imported.ImportedGitHubItemRepository;
import com.sortme.backend.imported.SyncStatus;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GitHubSyncService {

    private static final Logger log = LoggerFactory.getLogger(GitHubSyncService.class);

    private final ConnectionService connectionService;
    private final GitHubSelectedRepoRepository selectedRepoRepository;
    private final ImportedGitHubItemRepository repository;
    private final GitHubApiClient apiClient;

    /** One repo (or one issue) failing does not discard items that already
     * succeeded in the same sync call -- see GoogleDocsSyncService for the
     * same pattern. Minting the installation token is not per-item, so a
     * failure there still fails the whole call (nothing could have
     * succeeded yet). */
    @Transactional
    public List<ImportedGitHubItem> sync(UUID userId) {
        Connection connection = connectionService.findForSync(userId, ConnectionProvider.GITHUB)
            .orElseThrow(() -> new NotFoundException("GitHub is not connected"));
        if (connection.getInstallationId() == null) {
            throw new NotFoundException("No repositories selected yet -- install the GitHub App and choose repositories first");
        }

        String installationToken = apiClient.mintInstallationToken(connection.getInstallationId());
        List<GitHubSelectedRepo> repos = selectedRepoRepository.findAllByConnectionId(connection.getId());

        List<ImportedGitHubItem> results = new ArrayList<>();
        int failureCount = 0;
        int attempted = 0;
        for (GitHubSelectedRepo repo : repos) {
            try {
                List<GitHubApiClient.Issue> issues = apiClient.listIssuesAndPullRequests(installationToken, repo.getRepoFullName());
                attempted += issues.size();
                for (GitHubApiClient.Issue issue : issues) {
                    results.add(syncOne(userId, connection.getId(), repo.getRepoFullName(), issue));
                }
            } catch (Exception e) {
                log.warn("Failed to sync GitHub repo {}: {}", repo.getRepoFullName(), e.getMessage());
                attempted++;
                failureCount++;
            }
        }

        boolean allFailed = attempted > 0 && results.isEmpty();
        String error = failureCount == 0 ? null : failureCount + " repositor" + (failureCount == 1 ? "y" : "ies") + " failed to sync";
        connectionService.recordSyncResult(connection.getId(), !allFailed, error);
        return results;
    }

    private ImportedGitHubItem syncOne(UUID userId, UUID connectionId, String repoFullName, GitHubApiClient.Issue issue) {
        String sourceId = repoFullName + "#" + issue.number();
        ImportedGitHubItem item = repository.findByConnectionIdAndSourceId(connectionId, sourceId)
            .orElseGet(ImportedGitHubItem::new);
        item.setUserId(userId);
        item.setConnectionId(connectionId);
        item.setSourceId(sourceId);
        item.setItemType(issue.isPullRequest() ? GitHubItemType.PULL_REQUEST : GitHubItemType.ISSUE);
        item.setRepoFullName(repoFullName);
        item.setTitle(issue.title());
        item.setUrl(issue.htmlUrl());
        item.setState(issue.state());
        item.setGithubCreatedAt(issue.createdAt());
        item.setGithubUpdatedAt(issue.updatedAt());
        item.setGithubClosedAt(issue.closedAt());
        item.setSyncStatus(SyncStatus.SYNCED);
        item.setLastSyncedAt(Instant.now());
        return repository.save(item);
    }
}
