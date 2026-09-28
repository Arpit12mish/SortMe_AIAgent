package com.sortme.backend.config;

import com.sortme.backend.security.BearerAuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final BearerAuthInterceptor bearerAuthInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(bearerAuthInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns(
                "/api/auth/device",
                // The Picker page and its data endpoint are authorized by
                // their own short-lived, single-purpose pickerToken (see
                // PickerController/PickerSessionService), not the SortMe
                // session bearer token -- a WebView loading a page as a
                // plain GET has no way to attach an Authorization header.
                "/api/connections/google-docs/picker-page",
                "/api/connections/google-docs/picker-page-data",
                // GitHub's own redirect after app installation; see
                // GitHubSetupCallbackController for why this can't require
                // our session bearer token.
                "/api/connections/github/setup-callback",
                // The shared Google/GitHub OAuth redirect target -- reached
                // by the user's browser, not the app, so it carries no
                // bearer token either. See OAuthCallbackController.
                "/api/connections/oauth-callback"
            );
    }
}
