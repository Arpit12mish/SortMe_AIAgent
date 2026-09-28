package com.sortme.backend.imported;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ImportedDocumentRepository extends JpaRepository<ImportedDocument, UUID> {
    List<ImportedDocument> findAllByUserId(UUID userId);

    Optional<ImportedDocument> findByConnectionIdAndSourceId(UUID connectionId, String sourceId);

    Optional<ImportedDocument> findByIdAndUserId(UUID id, UUID userId);

    void deleteAllByConnectionId(UUID connectionId);
}
