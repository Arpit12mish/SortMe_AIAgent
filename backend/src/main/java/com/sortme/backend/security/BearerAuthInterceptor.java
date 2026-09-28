package com.sortme.backend.security;

import com.sortme.backend.exception.InvalidSessionException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class BearerAuthInterceptor implements HandlerInterceptor {

    private static final String PREFIX = "Bearer ";

    private final SessionService sessionService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(PREFIX)) {
            throw new InvalidSessionException("Missing bearer session token");
        }
        UUID userId = sessionService.validate(header.substring(PREFIX.length()));
        CurrentUserContext.set(userId);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        CurrentUserContext.clear();
    }
}
