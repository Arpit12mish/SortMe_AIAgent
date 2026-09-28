package com.sortme.backend.crypto;

import org.slf4j.Logger;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Loads a symmetric key from a base64-encoded config value, or falls back to
 * a random, process-lifetime-only key for local development so the app can
 * boot without every secret configured up front. Every fallback logs a
 * clear warning naming the env var to set before handling real data.
 */
public final class KeyMaterial {

    private static final SecureRandom RANDOM = new SecureRandom();

    private KeyMaterial() {
    }

    public static SecretKey loadOrGenerate(Logger log, String configuredBase64, String envVarName, int requiredBytes, String algorithm) {
        if (configuredBase64 == null || configuredBase64.isBlank()) {
            log.warn(
                "{} is not set -- generating a random, ephemeral key for this process only. "
                    + "Fine for local development; anything signed/encrypted with it becomes "
                    + "invalid after a restart. Set a stable base64-encoded {}-byte key "
                    + "(e.g. `openssl rand -base64 {}`) before using real accounts.",
                envVarName, requiredBytes, requiredBytes
            );
            byte[] random = new byte[requiredBytes];
            RANDOM.nextBytes(random);
            return new SecretKeySpec(random, algorithm);
        }
        byte[] decoded = Base64.getDecoder().decode(configuredBase64);
        if (decoded.length != requiredBytes) {
            throw new IllegalStateException(
                envVarName + " must decode to exactly " + requiredBytes + " bytes; got " + decoded.length
            );
        }
        return new SecretKeySpec(decoded, algorithm);
    }
}
