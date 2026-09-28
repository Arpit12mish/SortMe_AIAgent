package com.sortme.backend.google;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GoogleTokenResponse(
    @JsonProperty("access_token") String accessToken,
    @JsonProperty("refresh_token") String refreshToken,
    @JsonProperty("expires_in") Long expiresInSeconds,
    @JsonProperty("id_token") String idToken,
    @JsonProperty("scope") String scope,
    @JsonProperty("token_type") String tokenType
) {
}
