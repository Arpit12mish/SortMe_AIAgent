package com.sortme.backend.security;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.exception.InvalidOAuthStateException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The state token is the CSRF defense for the OAuth callback: it must bind
 * a specific user to a specific provider and reject anything that doesn't
 * match, is malformed, or has expired.
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
    void validatesSuccessfullyForTheSameUserAndProviderItWasIssuedFor() {
        OAuthStateService service = service(10);
        UUID userId = UUID.randomUUID();

        String state = service.issue(userId, ConnectionProvider.GOOGLE_DOCS);

        assertThatCode(() -> service.validate(state, userId, ConnectionProvider.GOOGLE_DOCS)).doesNotThrowAnyException();
    }

    @Test
    void rejectsStateWhenValidatedAgainstADifferentUser() {
        OAuthStateService service = service(10);
        String state = service.issue(UUID.randomUUID(), ConnectionProvider.GOOGLE_DOCS);

        assertThatThrownBy(() -> service.validate(state, UUID.randomUUID(), ConnectionProvider.GOOGLE_DOCS))
            .isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsStateWhenValidatedAgainstADifferentProvider() {
        OAuthStateService service = service(10);
        UUID userId = UUID.randomUUID();
        String state = service.issue(userId, ConnectionProvider.GOOGLE_DOCS);

        assertThatThrownBy(() -> service.validate(state, userId, ConnectionProvider.GITHUB))
            .isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsATamperedState() {
        OAuthStateService service = service(10);
        String state = service.issue(UUID.randomUUID(), ConnectionProvider.GOOGLE_GMAIL);
        String tampered = state.substring(0, state.length() - 1) + (state.endsWith("A") ? "B" : "A");

        assertThatThrownBy(() -> service.validate(tampered, UUID.randomUUID(), ConnectionProvider.GOOGLE_GMAIL))
            .isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsStateSignedByADifferentServerInstance() {
        // Simulates a state minted before a key rotation / by another
        // instance with a different ephemeral dev key.
        OAuthStateService serviceA = service(10);
        OAuthStateService serviceB = service(10);
        UUID userId = UUID.randomUUID();
        String state = serviceA.issue(userId, ConnectionProvider.GITHUB);

        assertThatThrownBy(() -> serviceB.validate(state, userId, ConnectionProvider.GITHUB))
            .isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsAnExpiredState() throws InterruptedException {
        SortMeProperties props = new SortMeProperties();
        props.setOauthStateTtlMinutes(0);
        OAuthStateService service = new OAuthStateService(props);
        service.init();
        UUID userId = UUID.randomUUID();
        String state = service.issue(userId, ConnectionProvider.GOOGLE_DOCS);

        Thread.sleep(1_100); // ttl of 0 minutes still rounds to "now"; sleep past it
        assertThatThrownBy(() -> service.validate(state, userId, ConnectionProvider.GOOGLE_DOCS))
            .isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void rejectsAGarbageStateValue() {
        OAuthStateService service = service(10);
        assertThatThrownBy(() -> service.validate("not-a-jwt", UUID.randomUUID(), ConnectionProvider.GOOGLE_DOCS))
            .isInstanceOf(InvalidOAuthStateException.class);
    }
}
