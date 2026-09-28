package com.sortme.backend.security;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.crypto.KeyMaterial;
import com.sortme.backend.exception.InvalidSessionException;
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
 * Issues and validates the bearer token the mobile app holds after
 * `POST /api/auth/device`. This is a device-scoped identity, not a
 * full account system: it lets the backend isolate one installation's
 * connections and imported data from another's.
 */
@Component
public class SessionService {

    private static final Logger log = LoggerFactory.getLogger(SessionService.class);

    private final SortMeProperties properties;
    private SecretKey key;

    public SessionService(SortMeProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void init() {
        this.key = KeyMaterial.loadOrGenerate(
            log, properties.getSessionSigningKey(), "SORTME_SESSION_SIGNING_KEY", 32, "HmacSHA256"
        );
    }

    public String issue(UUID userId) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(properties.getSessionTtlDays(), ChronoUnit.DAYS)))
            .signWith(key)
            .compact();
    }

    public UUID validate(String token) {
        try {
            var claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            return UUID.fromString(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidSessionException("Invalid or expired session token", e);
        }
    }
}
