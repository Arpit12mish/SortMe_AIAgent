package com.sortme.backend.connections;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The shared redirect target registered with both Google Cloud Console and
 * the GitHub App ("User authorization callback URL"). Reached by the
 * user's system browser, not by the mobile app directly -- it carries no
 * bearer token, which is why ConnectionService#completeOAuthCallback trusts
 * the signed `state` alone to identify the SortMe user and provider.
 */
@RestController
@RequiredArgsConstructor
public class OAuthCallbackController {

    private final ConnectionService connectionService;

    @GetMapping("/api/connections/oauth-callback")
    public ResponseEntity<Void> callback(
        @RequestParam(required = false) String code,
        @RequestParam(required = false) String state,
        @RequestParam(required = false) String error
    ) {
        String redirect = connectionService.completeOAuthCallback(code, state, error);
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, redirect).build();
    }
}
