package com.sortme.backend.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditEventRepository repository;

    /**
     * Records a security-relevant event. `detail` is a short, human-readable
     * summary (e.g. "provider=GOOGLE_DOCS scopes=drive.file") -- callers
     * must never pass token values or imported content here.
     */
    public void record(UUID userId, String eventType, String detail) {
        AuditEvent event = new AuditEvent();
        event.setUserId(userId);
        event.setEventType(eventType);
        event.setDetail(detail);
        repository.save(event);
    }
}
