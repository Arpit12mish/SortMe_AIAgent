package com.sortme.backend.connections;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GitHubSelectedRepoRepository extends JpaRepository<GitHubSelectedRepo, UUID> {
    List<GitHubSelectedRepo> findAllByConnectionId(UUID connectionId);

    void deleteAllByConnectionId(UUID connectionId);
}
