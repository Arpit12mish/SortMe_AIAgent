package com.sortme.backend.connections;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** A repository the user selected when installing the GitHub App, mirrored
 * locally so the Connections screen can show it without an extra API call. */
@Entity
@Table(name = "github_selected_repos")
@Getter
@Setter
@NoArgsConstructor
public class GitHubSelectedRepo {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "connection_id", nullable = false)
    private UUID connectionId;

    @Column(name = "repo_github_id", nullable = false)
    private long repoGithubId;

    @Column(name = "repo_full_name", nullable = false)
    private String repoFullName;

    @Column(name = "is_private", nullable = false)
    private boolean isPrivate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
