package com.sortme.backend.exception;

import org.springframework.http.HttpStatus;

/** The request itself is malformed in a way that isn't worth a provider
 * round-trip to discover -- e.g. an oversized or empty file upload. */
public class ValidationException extends ApiException {
    public ValidationException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
