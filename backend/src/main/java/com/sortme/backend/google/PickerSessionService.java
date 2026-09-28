package com.sortme.backend.google;

import com.sortme.backend.config.SortMeProperties;
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
import java.util.Date;
import java.util.UUID;

/**
 * Mints and validates the short-lived, single-purpose token that authorizes
 * a WebView-loaded Picker page to fetch a Drive access token. This is
 * deliberately not the user's normal session bearer token: the static
 * Picker page can't attach an Authorization header (it's a bare page load
 * from a WebView), so it gets its own narrow-purpose, 5-minute credential
 * instead of reusing the long-lived session token.
 */
@Component
public class PickerSessionService {

    private static final Logger log = LoggerFactory.getLogger(PickerSessionService.class);
    private static final long TTL_MINUTES = 5;

    private final SortMeProperties properties;
    private SecretKey key;

    public PickerSessionService(SortMeProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void init() {
        // Reuses the OAuth-state key material: both are short-lived,
        // narrow-purpose signed handshake tokens of the same sensitivity.
        this.key = KeyMaterial.loadOrGenerate(
            log, properties.getOauthStateSigningKey(), "SORTME_OAUTH_STATE_SIGNING_KEY", 32, "HmacSHA256"
        );
    }

    public String issue(UUID userId) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .claim("purpose", "google-docs-picker")
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(TTL_MINUTES * 60)))
            .signWith(key)
            .compact();
    }

    public UUID validate(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            if (!"google-docs-picker".equals(claims.get("purpose", String.class))) {
                throw new InvalidOAuthStateException("Token is not a picker session token");
            }
            return UUID.fromString(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidOAuthStateException("Invalid or expired picker session token", e);
        }
    }
}
