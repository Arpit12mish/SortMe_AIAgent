package com.sortme.backend.github;

import com.sortme.backend.config.SortMeProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The GitHub App's configured "Setup URL". GitHub redirects the system
 * browser here after the user finishes installing the app and selecting
 * repositories -- with no way for this request to carry our session bearer
 * token, so it does no per-user work itself. It only forwards
 * installation_id back into the app's own redirect scheme; the mobile app
 * (already holding its own session) is the one that calls
 * POST /api/connections/github/link-installation, which is what actually
 * associates the installation with a SortMe user (and verifies it belongs
 * to the GitHub account that user already authenticated as -- see
 * ConnectionService#linkGitHubInstallation).
 */
@RestController
@RequiredArgsConstructor
public class GitHubSetupCallbackController {

    private final SortMeProperties properties;

    @GetMapping("/api/connections/github/setup-callback")
    public ResponseEntity<Void> setupCallback(
        @RequestParam(required = false) String installation_id,
        @RequestParam(required = false) String setup_action
    ) {
        String redirect = UriComponentsBuilder.fromUriString(properties.getOauthRedirectUri())
            .queryParam("provider", "github")
            .queryParam("result", "installed")
            .queryParamIfPresent("installationId", java.util.Optional.ofNullable(installation_id))
            .queryParamIfPresent("setupAction", java.util.Optional.ofNullable(setup_action))
            .build()
            .toUriString();
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, redirect).build();
    }
}
