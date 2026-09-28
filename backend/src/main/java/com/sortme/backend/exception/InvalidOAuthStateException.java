package com.sortme.backend.exception;

import org.springframework.http.HttpStatus;

/** Thrown when the `state` returned by a provider doesn't verify: wrong
 * signature, expired, already used, or bound to a different user/provider
 * than the one making the exchange request. This is the CSRF defense for
 * the OAuth callback. */
public class InvalidOAuthStateException extends ApiException {
    public InvalidOAuthStateException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }

    public InvalidOAuthStateException(String message, Throwable cause) {
        super(HttpStatus.BAD_REQUEST, message, cause);
    }
}
