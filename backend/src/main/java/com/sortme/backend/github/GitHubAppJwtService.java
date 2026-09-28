package com.sortme.backend.github;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.exception.ProviderNotConfiguredException;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.bouncycastle.openssl.PEMKeyPair;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter;
import org.springframework.stereotype.Component;

import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.PrivateKey;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

/**
 * Mints the short-lived JWT the GitHub App uses to authenticate as itself
 * (distinct from any user's or installation's token) -- the first step in
 * exchanging for an installation access token. Never exposed to the mobile
 * client.
 */
@Component
@RequiredArgsConstructor
public class GitHubAppJwtService {

    private final SortMeProperties properties;
    private PrivateKey privateKey;

    @PostConstruct
    void init() {
        String base64Pem = properties.getGithub().getPrivateKeyBase64();
        if (base64Pem == null || base64Pem.isBlank()) {
            // Deferred: only actually required once a GitHub sync is attempted.
            return;
        }
        String pem = new String(Base64.getDecoder().decode(base64Pem), StandardCharsets.UTF_8);
        try (PEMParser parser = new PEMParser(new StringReader(pem))) {
            Object parsed = parser.readObject();
            JcaPEMKeyConverter converter = new JcaPEMKeyConverter();
            this.privateKey = parsed instanceof PEMKeyPair keyPair
                ? converter.getPrivateKey(keyPair.getPrivateKeyInfo())
                : converter.getPrivateKey((org.bouncycastle.asn1.pkcs.PrivateKeyInfo) parsed);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse GITHUB_APP_PRIVATE_KEY_BASE64 -- expected a base64-encoded PEM RSA key", e);
        }
    }

    public String mintAppJwt() {
        if (privateKey == null || properties.getGithub().getAppId() == null || properties.getGithub().getAppId().isBlank()) {
            throw new ProviderNotConfiguredException("GitHub App");
        }
        Instant now = Instant.now();
        return Jwts.builder()
            // Backdated by 60s to tolerate clock drift, per GitHub's own guidance.
            .issuedAt(Date.from(now.minusSeconds(60)))
            .expiration(Date.from(now.plusSeconds(9 * 60)))
            .issuer(properties.getGithub().getAppId())
            .signWith(privateKey, Jwts.SIG.RS256)
            .compact();
    }
}
