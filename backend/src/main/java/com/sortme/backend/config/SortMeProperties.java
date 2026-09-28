package com.sortme.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;

@Data
@ConfigurationProperties(prefix = "sortme")
public class SortMeProperties {

    private String sessionSigningKey;
    private long sessionTtlDays = 365;

    private String oauthStateSigningKey;
    private long oauthStateTtlMinutes = 10;

    private String tokenEncryptionKey;

    private String oauthRedirectUri;
    private String publicBaseUrl;

    @NestedConfigurationProperty
    private Google google = new Google();

    @NestedConfigurationProperty
    private GitHub github = new GitHub();

    @Data
    public static class Google {
        private String clientId;
        private String clientSecret;
        /** Optional: Cloud project number, used only for Picker.setAppId(). */
        private String projectNumber;
    }

    @Data
    public static class GitHub {
        private String appId;
        private String appSlug;
        private String clientId;
        private String clientSecret;
        private String privateKeyBase64;
    }
}
