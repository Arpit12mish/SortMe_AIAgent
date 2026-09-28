package com.sortme.backend.security;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.exception.InvalidOAuthStateException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The state token is the CSRF defense for the OAuth callback -- and, since
 * the callback is a public endpoint with no other authenticated context
 * (see ConnectionService#completeOAuthCallback), it is also the *sole*
 * source of truth for which user, which provider, and which PKCE verifier
 * a given `code` belongs to. It must reject anything malformed, expired,
 * or tampered with, and must round-trip the code_verifier exactly.
 */
class OAuthStateServiceTest {

    private OAuthStateService service(long ttlMinutes) {
        SortMeProperties props = new SortMeProperties();
        props.setOauthStateSigningKey(null); // exercises the dev-fallback key path too
        props.setOauthStateTtlMinutes(ttlMinutes);
        OAuthStateService service = new OAuthStateService(props);
        service.init();
        return service;
    }

    @Test
    void parsesBackTheUserProviderAndCodeVerifierItWasIssuedWith() {
        OAuthStateService service = service(10);
        UUID userId = UUID.randomUUID();

        String state = service.issue(userId, ConnectionProvider.GOOGLE_DOCS, "the-code-verifier");
        OAuthStateService.Claims claims = service.parse(state);

        assertThat(claims.userId()).isEqualTo(userId);
        assertThat(claims.provider()).isEqualTo(ConnectionProvider.GOOGLE_DOCS);
        assertThat(claims.codeVerifier()).isEqualTo("the-code-verifier");
    }

    @Test
    void distinguishesProvidersAndVerifiersForTheSameUser() {
        OAuthStateService service = service(10);
        UUID userId = UUID.randomUUID();

        String docsState = service.issue(userId, ConnectionProvider.GOOGLE_DOCS, "docs-verifier");
        String gmailState = service.issue(userId, ConnectionProvider.GOOGLE_GMAIL, "gmail-verifier");

        assertThat(service.parse(docsState).provider()).isEqualTo(ConnectionProvider.GOOGLE_DOCS);
        assertThat(service.parse(docsState).codeVerifier()).isEqualTo("docs-verifier");
        assertThat(service.parse(gmailState).provider()).isEqualTo(ConnectionProvider.GOOGLE_GMAIL);
        assertThat(service.parse(gmailState).codeVerifier()).isEqualTo("gmail-verifier");
    }

    @Test
    void rejectsATamperedState() {
        OAuthStateService service = service(10);
        String state = service.issue(UUID.randomUUID(), ConnectionProvider.GOOGLE_GMAIL, "verifier");
        String tampered = state.substring(0, state.length() - 1) + (state.endsWith("A") ? "B" : "A");

        assertThatThrownBy(() -> service.parse(tampered)).isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsStateSignedByADifferentServerInstance() {
        // Simulates a state minted before a key rotation / by another
        // instance with a different ephemeral dev key.
        OAuthStateService serviceA = service(10);
        OAuthStateService serviceB = service(10);
        String state = serviceA.issue(UUID.randomUUID(), ConnectionProvider.GITHUB, "verifier");

        assertThatThrownBy(() -> serviceB.parse(state)).isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsAnExpiredState() throws InterruptedException {
        SortMeProperties props = new SortMeProperties();
        props.setOauthStateTtlMinutes(0);
        OAuthStateService service = new OAuthStateService(props);
        service.init();
        String state = service.issue(UUID.randomUUID(), ConnectionProvider.GOOGLE_DOCS, "verifier");

        Thread.sleep(1_100); // ttl of 0 minutes still rounds to "now"; sleep past it
        assertThatThrownBy(() -> service.parse(state)).isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsAGarbageStateValue() {
        OAuthStateService service = service(10);
        assertThatThrownBy(() -> service.parse("not-a-jwt")).isInstanceOf(InvalidOAuthStateException.class);
    }
}
