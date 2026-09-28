package com.sortme.backend.google;

import com.sortme.backend.config.SortMeProperties;
import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionService;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.security.CurrentUserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/connections/google-docs")
@RequiredArgsConstructor
public class PickerController {

    private final PickerSessionService pickerSessionService;
    private final ConnectionService connectionService;
    private final SortMeProperties properties;

    public record PickerUrlResponse(String pickerUrl) {
    }

    public record PickerPageDataResponse(String accessToken, String appId) {
    }

    /** Bearer-authenticated: mints a short-lived picker session and returns
     * the URL the mobile app should load in a WebView. */
    @GetMapping("/picker-url")
    public PickerUrlResponse pickerUrl() {
        UUID userId = CurrentUserContext.require();
        connectionService.findForSync(userId, ConnectionProvider.GOOGLE_DOCS)
            .orElseThrow(() -> new NotFoundException("Connect Google Docs before opening the picker"));
        String token = pickerSessionService.issue(userId);
        String url = properties.getPublicBaseUrl() + "/api/connections/google-docs/picker-page?pickerToken=" + token;
        return new PickerUrlResponse(url);
    }

    /** Public static page (no session header available from a WebView GET);
     * authorized instead by the pickerToken its own JS reads from the URL
     * and forwards to /picker-page-data. */
    @GetMapping(value = "/picker-page", produces = MediaType.TEXT_HTML_VALUE)
    public String pickerPage() throws IOException {
        try (var in = new ClassPathResource("static/google-picker.html").getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** Public, but requires a valid single-purpose pickerToken (see
     * PickerSessionService) -- this is what actually gates access to a live
     * Drive access token, not BearerAuthInterceptor. */
    @GetMapping("/picker-page-data")
    public PickerPageDataResponse pickerPageData(@RequestParam String pickerToken) {
        UUID userId = pickerSessionService.validate(pickerToken);
        Connection connection = connectionService.findForSync(userId, ConnectionProvider.GOOGLE_DOCS)
            .orElseThrow(() -> new NotFoundException("Google Docs is not connected"));
        String accessToken = connectionService.getValidAccessToken(connection);
        return new PickerPageDataResponse(accessToken, properties.getGoogle().getProjectNumber());
    }
}
