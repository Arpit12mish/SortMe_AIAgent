package com.sortme.backend.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * RFC 7636 PKCE, generated and verified entirely server-side.
 *
 * <p>Google rejects a custom-scheme (`sortme://...`) redirect URI on a
 * "Web application" OAuth client -- only http(s) is accepted there, and
 * the native "iOS"/"Android" client types that do accept one bring their
 * own complications (a separate client per platform, an Android signing
 * fingerprint). So this backend, not the mobile app, is the party that
 * calls each provider's authorize and token endpoints; the mobile app
 * only ever opens a browser and waits for our own redirect back. PKCE is
 * still generated and used on this leg (defense in depth on top of the
 * client_secret), it just never needs to cross the wire to the client.
 */
public final class PkceUtil {

    private static final SecureRandom RANDOM = new SecureRandom();

    private PkceUtil() {
    }

    public static String generateVerifier() {
        byte[] bytes = new byte[64];
        RANDOM.nextBytes(bytes);
        return base64Url(bytes);
    }

    public static String challengeFor(String verifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return base64Url(hash);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
