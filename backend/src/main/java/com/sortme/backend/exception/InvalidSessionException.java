package com.sortme.backend.exception;

import org.springframework.http.HttpStatus;

public class InvalidSessionException extends ApiException {
    public InvalidSessionException(String message) {
        super(HttpStatus.UNAUTHORIZED, message);
    }

    public InvalidSessionException(String message, Throwable cause) {
        super(HttpStatus.UNAUTHORIZED, message, cause);
    }
}
