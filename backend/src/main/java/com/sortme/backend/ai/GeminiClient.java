package com.sortme.backend.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.exception.ProviderErrorException;
import com.sortme.backend.exception.ProviderNotConfiguredException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/** Thin wrapper around Gemini's generateContent REST API. Every AI feature
 * in this app goes through {@link #generateStructured}, which always asks
 * Gemini for JSON matching a caller-supplied schema rather than parsing
 * free text -- this is the one place that does JSON-from-model parsing. */
@Component
@RequiredArgsConstructor
public class GeminiClient {

    private static final String ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

    private final SortMeProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient = RestClient.create();

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record InlineData(String mimeType, String data) {
    }

    /** Exactly one of `text`/`inlineData` is set per Part, matching how
     * generateContent's multimodal parts work -- never both. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Part(String text, InlineData inlineData) {
        public static Part text(String text) {
            return new Part(text, null);
        }

        public static Part audio(String mimeType, byte[] bytes) {
            return new Part(null, new InlineData(mimeType, Base64.getEncoder().encodeToString(bytes)));
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Content(String role, List<Part> parts) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GenerationConfig(String responseMimeType, Map<String, Object> responseSchema) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GoogleSearchTool(Map<String, Object> googleSearch) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GenerateContentRequest(
        List<Content> contents, Content systemInstruction, GenerationConfig generationConfig, List<GoogleSearchTool> tools
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ResponsePart(String text) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ResponseContent(List<ResponsePart> parts) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Candidate(ResponseContent content, String finishReason) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GenerateContentResponse(List<Candidate> candidates) {
    }

    /** responseSchema is an OpenAPI-subset JSON Schema (plain nested
     * Map/List so each feature can build its own ad hoc shape without a
     * dedicated schema-builder type), e.g.
     * {@code Map.of("type", "object", "properties", Map.of(...), "required", List.of(...))}. */
    public <T> T generateStructured(String systemInstruction, String userContent, Map<String, Object> responseSchema, Class<T> type) {
        return generateStructured(systemInstruction, userContent, responseSchema, type, false);
    }

    /** Same as {@link #generateStructured(String, String, Map, Class)}, with
     * `useGoogleSearch=true` additionally grounding the response in live
     * Google Search results -- verified to combine correctly with a
     * responseSchema in a single call. Use for anything that needs current,
     * dated real-world information (e.g. market/trend research) rather than
     * just reasoning over the user's own stored data. */
    public <T> T generateStructured(String systemInstruction, String userContent, Map<String, Object> responseSchema, Class<T> type, boolean useGoogleSearch) {
        String apiKey = properties.getGemini().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new ProviderNotConfiguredException("Gemini");
        }

        var request = new GenerateContentRequest(
            List.of(new Content("user", List.of(Part.text(userContent)))),
            new Content(null, List.of(Part.text(systemInstruction))),
            new GenerationConfig("application/json", responseSchema),
            useGoogleSearch ? List.of(new GoogleSearchTool(Map.of())) : null
        );

        return send(request, type);
    }

    /** Same JSON-structured-output contract as {@link #generateStructured},
     * but the user content is an audio clip (plus a short text prompt)
     * instead of plain text -- used for transcription. `audioBytes` is
     * base64-encoded inline here, so callers must keep clips within
     * Gemini's inline-request size limit (not the much larger Files API
     * limit); {@code AudioTranscriptionService} enforces a conservative cap
     * before this is ever called. */
    public <T> T generateStructuredFromAudio(
        String systemInstruction, String promptText, byte[] audioBytes, String audioMimeType,
        Map<String, Object> responseSchema, Class<T> type
    ) {
        String apiKey = properties.getGemini().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new ProviderNotConfiguredException("Gemini");
        }

        var request = new GenerateContentRequest(
            List.of(new Content("user", List.of(Part.text(promptText), Part.audio(audioMimeType, audioBytes)))),
            new Content(null, List.of(Part.text(systemInstruction))),
            new GenerationConfig("application/json", responseSchema),
            null
        );

        return send(request, type);
    }

    private <T> T send(GenerateContentRequest request, Class<T> type) {
        String apiKey = properties.getGemini().getApiKey();
        GenerateContentResponse response;
        try {
            response = restClient.post()
                .uri(ENDPOINT, properties.getGemini().getModel())
                .header("x-goog-api-key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(GenerateContentResponse.class);
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }

        String json = extractText(response);
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            throw new ProviderErrorException("Gemini returned a response that could not be parsed", e, true, false);
        }
    }

    private String extractText(GenerateContentResponse response) {
        if (response == null || response.candidates() == null || response.candidates().isEmpty()) {
            throw new ProviderErrorException("Gemini returned no candidates", true, false);
        }
        ResponseContent content = response.candidates().get(0).content();
        if (content == null || content.parts() == null || content.parts().isEmpty()) {
            throw new ProviderErrorException("Gemini returned an empty response", true, false);
        }
        String text = content.parts().get(0).text();
        if (text == null || text.isBlank()) {
            throw new ProviderErrorException("Gemini returned an empty response", true, false);
        }
        return text;
    }

    private ProviderErrorException providerError(RestClientResponseException e) {
        boolean retryable = e.getStatusCode().is5xxServerError() || e.getStatusCode().value() == 429;
        return new ProviderErrorException("Gemini request failed: " + e.getStatusCode(), e, retryable, false);
    }
}
