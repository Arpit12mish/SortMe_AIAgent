package com.sortme.backend.connections;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.security.CurrentUserContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/connections")
@RequiredArgsConstructor
public class ConnectionsController {

    private final ConnectionService connectionService;
    private final SortMeProperties properties;

    public record StartResponse(String authorizeUrl) {
    }

    public record LinkInstallationRequest(@NotBlank String installationId) {
    }

    public record GitHubInstallUrlResponse(String installUrl) {
    }

    @GetMapping
    public List<ConnectionDto> list() {
        return connectionService.listConnections(CurrentUserContext.require());
    }

    /** No request body: the app only needs to know where to send the
     * browser. This backend generates and holds the PKCE pair and the
     * authorization code exchange happens entirely server-side at
     * OAuthCallbackController -- see ConnectionService#startOAuth. */
    @PostMapping("/{provider}/start")
    public StartResponse start(@PathVariable ConnectionProvider provider) {
        ConnectionService.StartResult result = connectionService.startOAuth(CurrentUserContext.require(), provider);
        return new StartResponse(result.authorizeUrl());
    }

    @GetMapping("/github/install-url")
    public GitHubInstallUrlResponse gitHubInstallUrl() {
        String slug = properties.getGithub().getAppSlug();
        return new GitHubInstallUrlResponse("https://github.com/apps/" + slug + "/installations/new");
    }

    @PostMapping("/github/link-installation")
    public ConnectionDto linkInstallation(@Valid @RequestBody LinkInstallationRequest request) {
        return connectionService.linkGitHubInstallation(CurrentUserContext.require(), request.installationId());
    }

    @DeleteMapping("/{provider}")
    public ResponseEntity<Void> disconnect(
        @PathVariable ConnectionProvider provider,
        @RequestParam(name = "deleteImportedData", defaultValue = "false") boolean deleteImportedData
    ) {
        connectionService.disconnect(CurrentUserContext.require(), provider, deleteImportedData);
        return ResponseEntity.noContent().build();
    }
}
