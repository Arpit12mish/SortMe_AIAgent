package com.sortme.backend.security;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class PkceUtilTest {

    @Test
    void verifierIsWithinRfc7636LengthBounds() {
        String verifier = PkceUtil.generateVerifier();
        assertThat(verifier.length()).isBetween(43, 128);
        assertThat(verifier).matches("^[A-Za-z0-9_-]+$");
    }

    @Test
    void twoGeneratedVerifiersAreDifferent() {
        assertThat(PkceUtil.generateVerifier()).isNotEqualTo(PkceUtil.generateVerifier());
    }

    @Test
    void challengeIsDeterministicForTheSameVerifier() {
        String verifier = PkceUtil.generateVerifier();
        assertThat(PkceUtil.challengeFor(verifier)).isEqualTo(PkceUtil.challengeFor(verifier));
    }

    @Test
    void challengeIsTheBase64UrlSha256OfTheVerifier() throws Exception {
        String verifier = "fixed-test-verifier-value";
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
        byte[] expectedHash = digest.digest(verifier.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        String expected = Base64.getUrlEncoder().withoutPadding().encodeToString(expectedHash);

        assertThat(PkceUtil.challengeFor(verifier)).isEqualTo(expected);
    }

    @Test
    void challengeContainsNoBase64PaddingOrUrlUnsafeCharacters() {
        String challenge = PkceUtil.challengeFor(PkceUtil.generateVerifier());
        assertThat(challenge).doesNotContain("=", "+", "/");
    }
}
