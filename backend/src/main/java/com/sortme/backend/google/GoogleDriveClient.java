package com.sortme.backend.google;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.sortme.backend.exception.ProviderErrorException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class GoogleDriveClient {

    private static final String NATIVE_DOC_MIME_TYPE = "application/vnd.google-apps.document";
    /** Keeps stored+embedded content bounded; the review UI truncates further. */
    private static final int MAX_CONTENT_CHARS = 50_000;

    private final RestClient restClient = RestClient.create();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DriveFileMeta(
        String id,
        String name,
        @JsonProperty("mimeType") String mimeType,
        @JsonProperty("webViewLink") String webViewLink,
        @JsonProperty("modifiedTime") String modifiedTime
    ) {
    }

    public DriveFileMeta getMeta(String accessToken, String fileId) {
        try {
            return restClient.get()
                .uri("https://www.googleapis.com/drive/v3/files/{id}?fields=id,name,mimeType,webViewLink,modifiedTime", fileId)
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(DriveFileMeta.class);
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    /** Plain-text export for native Google Docs; null for any other file
     * type (spreadsheets, PDFs, uploaded files) -- we deliberately don't
     * attempt format-specific text extraction for those in this slice. */
    public String getTextContent(String accessToken, DriveFileMeta meta) {
        if (!NATIVE_DOC_MIME_TYPE.equals(meta.mimeType())) {
            return null;
        }
        try {
            String text = restClient.get()
                .uri("https://www.googleapis.com/drive/v3/files/{id}/export?mimeType=text/plain", meta.id())
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(String.class);
            if (text == null) return null;
            return text.length() > MAX_CONTENT_CHARS ? text.substring(0, MAX_CONTENT_CHARS) : text;
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    private ProviderErrorException providerError(RestClientResponseException e) {
        boolean unauthorized = e.getStatusCode().value() == 401;
        return new ProviderErrorException("Google Drive request failed: " + e.getStatusCode(), e, !unauthorized, unauthorized);
    }
}
