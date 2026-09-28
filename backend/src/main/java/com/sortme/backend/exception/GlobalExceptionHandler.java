package com.sortme.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ProviderErrorException.class)
    public ResponseEntity<ErrorResponse> handleProviderError(ProviderErrorException e) {
        log.warn("Provider error: {}", e.getMessage());
        return ResponseEntity.status(e.getStatus()).body(
            new ErrorResponse("provider_error", e.getMessage(), e.isRetryable(), e.isRequiresReconnect())
        );
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException e) {
        log.warn("{}: {}", e.getClass().getSimpleName(), e.getMessage());
        return ResponseEntity.status(e.getStatus()).body(ErrorResponse.of(e.getClass().getSimpleName(), e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) {
        // Deliberately does not include e.getMessage() in the response body:
        // unexpected exceptions can carry provider payloads in their message.
        log.error("Unhandled exception", e);
        return ResponseEntity.internalServerError().body(ErrorResponse.of("internal_error", "Something went wrong"));
    }
}
