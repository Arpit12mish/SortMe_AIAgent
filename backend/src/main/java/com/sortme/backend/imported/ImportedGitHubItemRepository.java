package com.sortme.backend.imported;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ImportedGitHubItemRepository extends JpaRepository<ImportedGitHubItem, UUID> {
    List<ImportedGitHubItem> findAllByUserId(UUID userId);

    Optional<ImportedGitHubItem> findByConnectionIdAndSourceId(UUID connectionId, String sourceId);

    Optional<ImportedGitHubItem> findByIdAndUserId(UUID id, UUID userId);

    void deleteAllByConnectionId(UUID connectionId);
}
