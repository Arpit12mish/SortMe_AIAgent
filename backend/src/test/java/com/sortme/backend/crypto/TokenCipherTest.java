package com.sortme.backend.crypto;

import com.sortme.backend.config.SortMeProperties;
import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TokenCipherTest {

    private TokenCipher cipherWithKey(String base64Key) {
        SortMeProperties props = new SortMeProperties();
        props.setTokenEncryptionKey(base64Key);
        TokenCipher cipher = new TokenCipher(props);
        cipher.init();
        return cipher;
    }

    private String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    @Test
    void encryptThenDecryptReturnsOriginalPlaintext() {
        TokenCipher cipher = cipherWithKey(randomKey());
        String plaintext = "ya29.a0Test-refresh-token-value";

        String encrypted = cipher.encrypt(plaintext);
        assertThat(encrypted).doesNotContain(plaintext);
        assertThat(cipher.decrypt(encrypted)).isEqualTo(plaintext);
    }

    @Test
    void encryptingTheSameValueTwiceProducesDifferentCiphertext() {
        // Random IV per call: equal ciphertexts would leak that two stored
        // tokens are identical.
        TokenCipher cipher = cipherWithKey(randomKey());
        String plaintext = "same-token-value";

        assertThat(cipher.encrypt(plaintext)).isNotEqualTo(cipher.encrypt(plaintext));
    }

    @Test
    void decryptFailsWithWrongKey() {
        TokenCipher a = cipherWithKey(randomKey());
        TokenCipher b = cipherWithKey(randomKey());
        String encrypted = a.encrypt("secret-refresh-token");

        assertThatThrownBy(() -> b.decrypt(encrypted)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void missingConfiguredKeyFallsBackToRandomEphemeralKeyRatherThanFailingToStart() {
        TokenCipher cipher = cipherWithKey(null);
        String encrypted = cipher.encrypt("value");
        assertThat(cipher.decrypt(encrypted)).isEqualTo("value");
    }

    @Test
    void rejectsAKeyThatIsNotExactly32Bytes() {
        SortMeProperties props = new SortMeProperties();
        props.setTokenEncryptionKey(Base64.getEncoder().encodeToString("too-short".getBytes()));
        TokenCipher cipher = new TokenCipher(props);

        assertThatThrownBy(cipher::init).isInstanceOf(IllegalStateException.class);
    }
}
