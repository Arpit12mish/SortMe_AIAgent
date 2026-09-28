package com.sortme.backend.security;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.crypto.KeyMaterial;
import com.sortme.backend.exception.InvalidOAuthStateException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

/**
 * Mints and validates the `state` parameter used in every OAuth
 * authorize-request this backend builds. It is a short-lived, signed token
 * binding the flow to (a) the SortMe user who started it and (b) the
 * provider being connected, so a callback can't be replayed against a
 * different user or a different provider's exchange endpoint. This is the
 * CSRF defense the OAuth spec calls for.
 */
@Component
public class OAuthStateService {

    private static final Logger log = LoggerFactory.getLogger(OAuthStateService.class);

    private final SortMeProperties properties;
    private SecretKey key;

    public OAuthStateService(SortMeProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void init() {
        this.key = KeyMaterial.loadOrGenerate(
            log, properties.getOauthStateSigningKey(), "SORTME_OAUTH_STATE_SIGNING_KEY", 32, "HmacSHA256"
        );
    }

    public String issue(UUID userId, ConnectionProvider provider) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .claim("provider", provider.name())
            .claim("nonce", UUID.randomUUID().toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(properties.getOauthStateTtlMinutes(), ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    /** Verifies signature, expiry, and that the state was issued for exactly
     * this user and provider. Throws InvalidOAuthStateException otherwise. */
    public void validate(String state, UUID expectedUserId, ConnectionProvider expectedProvider) {
        try {
            Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(state).getPayload();
            UUID userId = UUID.fromString(claims.getSubject());
            ConnectionProvider provider = ConnectionProvider.valueOf(claims.get("provider", String.class));
            if (!userId.equals(expectedUserId)) {
                throw new InvalidOAuthStateException("OAuth state does not belong to the requesting user");
            }
            if (provider != expectedProvider) {
                throw new InvalidOAuthStateException("OAuth state was issued for a different provider");
            }
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidOAuthStateException("Invalid or expired OAuth state", e);
        }
    }
}
