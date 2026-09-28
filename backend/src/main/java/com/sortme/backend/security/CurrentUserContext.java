package com.sortme.backend.security;

import java.util.UUID;

/** Holds the authenticated user id for the duration of one request. Set by
 * BearerAuthInterceptor, read by controllers/services, cleared after the
 * request completes. */
public final class CurrentUserContext {

    private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();

    private CurrentUserContext() {
    }

    static void set(UUID userId) {
        CURRENT.set(userId);
    }

    static void clear() {
        CURRENT.remove();
    }

    public static UUID require() {
        UUID userId = CURRENT.get();
        if (userId == null) {
            throw new IllegalStateException("No authenticated user on this thread -- is the route excluded from BearerAuthInterceptor?");
        }
        return userId;
    }
}
