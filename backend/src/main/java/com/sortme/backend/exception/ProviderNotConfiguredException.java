package com.sortme.backend.exception;

import org.springframework.http.HttpStatus;

/** Thrown when a provider's client id/secret (or GitHub App key) hasn't
 * been set on this server yet -- distinct from a user-facing connection
 * error, since no user action can fix it. */
public class ProviderNotConfiguredException extends ApiException {
    public ProviderNotConfiguredException(String provider) {
        super(HttpStatus.SERVICE_UNAVAILABLE, provider + " is not configured on this server yet");
    }
}
