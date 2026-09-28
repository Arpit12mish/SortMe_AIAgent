package com.sortme.backend.imported;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ImportedEmailRepository extends JpaRepository<ImportedEmail, UUID> {
    List<ImportedEmail> findAllByUserId(UUID userId);

    Optional<ImportedEmail> findByConnectionIdAndSourceId(UUID connectionId, String sourceId);

    Optional<ImportedEmail> findByIdAndUserId(UUID id, UUID userId);

    void deleteAllByConnectionId(UUID connectionId);
}
