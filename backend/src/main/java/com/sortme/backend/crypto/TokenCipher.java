package com.sortme.backend.crypto;

import com.sortme.backend.config.SortMeProperties;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Encrypts provider access/refresh tokens before they are persisted, and
 * decrypts them on read. AES-256-GCM with a random 12-byte IV per value.
 *
 * Stored format: base64(iv) + ":" + base64(ciphertext-with-tag). Never logs
 * plaintext or ciphertext.
 */
@Component
@RequiredArgsConstructor
public class TokenCipher {

    private static final Logger log = LoggerFactory.getLogger(TokenCipher.class);
    private static final String ALGO = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SortMeProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    private SecretKey key;

    @PostConstruct
    void init() {
        this.key = KeyMaterial.loadOrGenerate(
            log, properties.getTokenEncryptionKey(), "SORTME_TOKEN_ENC_KEY", 32, "AES"
        );
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(ALGO);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(ciphertext);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt value", e);
        }
    }

    public String decrypt(String stored) {
        try {
            int sep = stored.indexOf(':');
            byte[] iv = Base64.getDecoder().decode(stored.substring(0, sep));
            byte[] ciphertext = Base64.getDecoder().decode(stored.substring(sep + 1));
            Cipher cipher = Cipher.getInstance(ALGO);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);
            return new String(plaintext, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt value", e);
        }
    }
}
