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

    public record StartRequest(@NotBlank String codeChallenge) {
    }

    public record StartResponse(String authorizeUrl, String state) {
    }

    public record ExchangeRequest(@NotBlank String code, @NotBlank String codeVerifier, @NotBlank String state) {
    }

    public record LinkInstallationRequest(@NotBlank String installationId) {
    }

    public record GitHubInstallUrlResponse(String installUrl) {
    }

    @GetMapping
    public List<ConnectionDto> list() {
        return connectionService.listConnections(CurrentUserContext.require());
    }

    @PostMapping("/{provider}/start")
    public StartResponse start(@PathVariable ConnectionProvider provider, @Valid @RequestBody StartRequest request) {
        ConnectionService.StartResult result = connectionService.startOAuth(CurrentUserContext.require(), provider, request.codeChallenge());
        return new StartResponse(result.authorizeUrl(), result.state());
    }

    @PostMapping("/{provider}/exchange")
    public ConnectionDto exchange(@PathVariable ConnectionProvider provider, @Valid @RequestBody ExchangeRequest request) {
        return connectionService.exchangeOAuth(
            CurrentUserContext.require(), provider, request.code(), request.codeVerifier(), request.state()
        );
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
