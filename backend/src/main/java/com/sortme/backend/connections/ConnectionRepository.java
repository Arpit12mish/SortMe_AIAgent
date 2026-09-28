package com.sortme.backend.connections;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConnectionRepository extends JpaRepository<Connection, UUID> {
    List<Connection> findAllByUserId(UUID userId);

    Optional<Connection> findByUserIdAndProvider(UUID userId, ConnectionProvider provider);

    Optional<Connection> findByIdAndUserId(UUID id, UUID userId);
}
