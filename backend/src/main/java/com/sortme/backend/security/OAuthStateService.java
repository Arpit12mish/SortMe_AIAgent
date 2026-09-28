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
 * authorize-request this backend builds.
 *
 * <p>Because the token exchange happens at a public callback this backend
 * owns (see ConnectionService#completeOAuthCallback) rather than at a
 * bearer-authenticated endpoint the mobile app calls, there is no separate
 * "expected user" to cross-check against at that point -- the signed state
 * token itself is the sole source of truth for which SortMe user and which
 * provider a given `code` belongs to, and it also carries the PKCE
 * code_verifier this same backend generated when it minted the authorize
 * URL. Forging or replaying it against a different flow requires forging
 * our HMAC signature.
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

    public record Claims(UUID userId, ConnectionProvider provider, String codeVerifier) {
    }

    public String issue(UUID userId, ConnectionProvider provider, String codeVerifier) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .claim("provider", provider.name())
            .claim("cv", codeVerifier)
            .claim("nonce", UUID.randomUUID().toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(properties.getOauthStateTtlMinutes(), ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    /** Verifies signature and expiry, then returns the embedded claims.
     * Throws InvalidOAuthStateException for anything invalid, expired, or
     * tampered with. */
    public Claims parse(String state) {
        try {
            io.jsonwebtoken.Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(state).getPayload();
            UUID userId = UUID.fromString(claims.getSubject());
            ConnectionProvider provider = ConnectionProvider.valueOf(claims.get("provider", String.class));
            String codeVerifier = claims.get("cv", String.class);
            return new Claims(userId, provider, codeVerifier);
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidOAuthStateException("Invalid or expired OAuth state", e);
        }
    }
}
