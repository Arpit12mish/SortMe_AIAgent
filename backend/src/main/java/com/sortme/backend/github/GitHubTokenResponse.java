package com.sortme.backend.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GitHubTokenResponse(
    @JsonProperty("access_token") String accessToken,
    @JsonProperty("refresh_token") String refreshToken,
    @JsonProperty("expires_in") Long expiresInSeconds,
    @JsonProperty("refresh_token_expires_in") Long refreshExpiresInSeconds,
    @JsonProperty("token_type") String tokenType,
    @JsonProperty("error") String error,
    @JsonProperty("error_description") String errorDescription
) {
}
