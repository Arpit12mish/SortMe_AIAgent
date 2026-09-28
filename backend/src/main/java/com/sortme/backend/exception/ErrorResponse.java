package com.sortme.backend.exception;

public record ErrorResponse(String error, String message, Boolean retryable, Boolean requiresReconnect) {
    public static ErrorResponse of(String error, String message) {
        return new ErrorResponse(error, message, null, null);
    }
}
