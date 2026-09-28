package com.sortme.backend.user;

import com.sortme.backend.audit.AuditService;
import com.sortme.backend.security.SessionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Bootstraps a device-scoped identity: the mobile app generates a random
 * installation id once (stored in SecureStore) and exchanges it here for a
 * session token. This is not a login/account system -- there is no
 * password, email, or way to move an identity between devices -- it exists
 * only so the backend can isolate one installation's OAuth connections and
 * imported data from another's.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class DeviceAuthController {

    private final UserRepository userRepository;
    private final SessionService sessionService;
    private final AuditService auditService;

    public record DeviceAuthRequest(@NotBlank String installId) {
    }

    public record DeviceAuthResponse(String sessionToken, UUID userId) {
    }

    @PostMapping("/device")
    public DeviceAuthResponse device(@Valid @RequestBody DeviceAuthRequest request) {
        boolean[] created = {false};
        User user = userRepository.findByInstallId(request.installId())
            .orElseGet(() -> {
                created[0] = true;
                return userRepository.save(new User(request.installId()));
            });
        if (created[0]) {
            auditService.record(user.getId(), "USER_CREATED", null);
        }
        String token = sessionService.issue(user.getId());
        return new DeviceAuthResponse(token, user.getId());
    }
}
