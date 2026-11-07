package com.sortme.backend.google;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.sortme.backend.exception.ProviderErrorException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.List;

@Component
public class GmailClient {

    private static final int MAX_BODY_CHARS = 20_000;

    private final RestClient restClient = RestClient.create();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MessageRef(String id, String threadId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ListResponse(List<MessageRef> messages, String nextPageToken) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Header(String name, String value) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Body(String data) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Part(String mimeType, Body body, List<Part> parts, List<Header> headers) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Message(String id, String threadId, String snippet, Part payload) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Thread(String id, List<Message> messages) {
    }

    public record SendResult(String id, String threadId) {
    }

    /** `query` is a normal Gmail search string, e.g. "after:2026/01/01 before:2026/02/01 (interview OR deadline)". */
    public ListResponse listMessageIds(String accessToken, String query, int maxResults) {
        return listMessageIds(accessToken, query, maxResults, null);
    }

    /** Same as {@link #listMessageIds(String, String, int)}, but continues
     * from a prior page's {@code nextPageToken} -- pass null for the first
     * page. */
    public ListResponse listMessageIds(String accessToken, String query, int maxResults, String pageToken) {
        try {
            UriComponentsBuilder uri = UriComponentsBuilder.fromUriString("https://gmail.googleapis.com/gmail/v1/users/me/messages")
                .queryParam("q", query)
                .queryParam("maxResults", maxResults);
            if (pageToken != null && !pageToken.isBlank()) {
                uri.queryParam("pageToken", pageToken);
            }
            return restClient.get()
                .uri(uri.build().toUri())
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(ListResponse.class);
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    public Message getMessage(String accessToken, String id) {
        try {
            return restClient.get()
                .uri("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full", id)
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(Message.class);
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    /** Fetches every message in a thread, ground truth for "who sent the
     * last message" -- a single synced message only reflects whichever one
     * matched a past sync's search query, not necessarily the latest. */
    public Thread getThread(String accessToken, String threadId) {
        try {
            return restClient.get()
                .uri("https://gmail.googleapis.com/gmail/v1/users/me/threads/{id}?format=full", threadId)
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(Thread.class);
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    private record SendRequest(String raw, String threadId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record SendResponseBody(String id, String threadId) {
    }

    /** `rawBase64Url` is a complete RFC 2822 message, base64url-encoded (see
     * GmailMessageBuilder). Setting `threadId` keeps the reply in the
     * existing Gmail thread instead of starting a new one. */
    public SendResult sendMessage(String accessToken, String rawBase64Url, String threadId) {
        try {
            SendResponseBody body = restClient.post()
                .uri("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(new SendRequest(rawBase64Url, threadId))
                .retrieve()
                .body(SendResponseBody.class);
            if (body == null) {
                throw new ProviderErrorException("Gmail send returned an empty response", true, false);
            }
            return new SendResult(body.id(), body.threadId());
        } catch (RestClientResponseException e) {
            throw providerError(e);
        }
    }

    public static String header(Message message, String name) {
        if (message.payload() == null || message.payload().headers() == null) return null;
        return message.payload().headers().stream()
            .filter(h -> h.name().equalsIgnoreCase(name))
            .map(Header::value)
            .findFirst()
            .orElse(null);
    }

    /** Walks the MIME tree breadth-first for the first text/plain part and
     * decodes it, size-capped. Returns null if the message has no
     * text/plain part (e.g. HTML-only). */
    public static String extractPlainText(Part root) {
        Deque<Part> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            Part part = queue.poll();
            if (part == null) continue;
            if ("text/plain".equals(part.mimeType()) && part.body() != null && part.body().data() != null) {
                byte[] decoded = Base64.getUrlDecoder().decode(part.body().data());
                String text = new String(decoded, StandardCharsets.UTF_8);
                return text.length() > MAX_BODY_CHARS ? text.substring(0, MAX_BODY_CHARS) : text;
            }
            if (part.parts() != null) {
                queue.addAll(part.parts());
            }
        }
        return null;
    }

    private ProviderErrorException providerError(RestClientResponseException e) {
        boolean unauthorized = e.getStatusCode().value() == 401;
        return new ProviderErrorException("Gmail request failed: " + e.getStatusCode(), e, !unauthorized, unauthorized);
    }
}
