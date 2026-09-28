package com.sortme.backend.exception;

import org.springframework.http.HttpStatus;

/** A provider API call failed: revoked token, rate limit, network error, or
 * an unexpected response shape. Carries a `retryable` hint so the mobile
 * client can distinguish "try again later" from "reconnect required". */
public class ProviderErrorException extends ApiException {
    private final boolean retryable;
    private final boolean requiresReconnect;

    public ProviderErrorException(String message, boolean retryable, boolean requiresReconnect) {
        super(HttpStatus.BAD_GATEWAY, message);
        this.retryable = retryable;
        this.requiresReconnect = requiresReconnect;
    }

    public ProviderErrorException(String message, Throwable cause, boolean retryable, boolean requiresReconnect) {
        super(HttpStatus.BAD_GATEWAY, message, cause);
        this.retryable = retryable;
        this.requiresReconnect = requiresReconnect;
    }

    public boolean isRetryable() {
        return retryable;
    }

    public boolean isRequiresReconnect() {
        return requiresReconnect;
    }
}
