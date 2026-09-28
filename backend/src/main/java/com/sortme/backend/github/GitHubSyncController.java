package com.sortme.backend.github;

import com.sortme.backend.imported.ImportedItemDto;
import com.sortme.backend.security.CurrentUserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/connections/github")
@RequiredArgsConstructor
public class GitHubSyncController {

    private final GitHubSyncService syncService;

    @PostMapping("/sync")
    public List<ImportedItemDto> sync() {
        return syncService.sync(CurrentUserContext.require()).stream().map(ImportedItemDto::fromGitHubItem).toList();
    }
}
