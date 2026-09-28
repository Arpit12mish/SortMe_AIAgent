package com.sortme.backend.imported;

import com.sortme.backend.connections.Connection;
import com.sortme.backend.connections.ConnectionProvider;
import com.sortme.backend.connections.ConnectionRepository;
import com.sortme.backend.connections.ConnectionStatus;
import com.sortme.backend.exception.NotFoundException;
import com.sortme.backend.user.User;
import com.sortme.backend.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ImportedItemsServiceTest {

    @Autowired
    private ImportedItemsService service;
    @Autowired
    private ImportedDocumentRepository documentRepository;
    @Autowired
    private ImportedEmailRepository emailRepository;
    @Autowired
    private ImportedGitHubItemRepository githubItemRepository;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private UserRepository userRepository;

    private User userA;
    private User userB;
    private Connection docsConnectionA;

    @BeforeEach
    void setUp() {
        userA = userRepository.save(new User("install-" + UUID.randomUUID()));
        userB = userRepository.save(new User("install-" + UUID.randomUUID()));
        docsConnectionA = connectionRepository.save(newConnection(userA, ConnectionProvider.GOOGLE_DOCS));
    }

    private Connection newConnection(User user, ConnectionProvider provider) {
        Connection c = new Connection();
        c.setUserId(user.getId());
        c.setProvider(provider);
        c.setStatus(ConnectionStatus.CONNECTED);
        return c;
    }

    private ImportedDocument upsertDocument(UUID userId, UUID connectionId, String sourceId, String title) {
        // Mirrors exactly the find-or-create-by-source-id pattern
        // GoogleDocsSyncService#syncOne uses, without needing to mock the
        // whole HTTP chain: this is where duplicate-sync protection
        // actually lives.
        ImportedDocument doc = documentRepository.findByConnectionIdAndSourceId(connectionId, sourceId)
            .orElseGet(ImportedDocument::new);
        doc.setUserId(userId);
        doc.setConnectionId(connectionId);
        doc.setSourceId(sourceId);
        doc.setTitle(title);
        doc.setSourceLink("https://docs.google.com/document/d/" + sourceId);
        doc.setModifiedTime(Instant.now());
        doc.setSyncStatus(SyncStatus.SYNCED);
        doc.setLastSyncedAt(Instant.now());
        return documentRepository.save(doc);
    }

    @Test
    void syncingTheSameSourceIdTwiceUpdatesInPlaceRatherThanDuplicating() {
        upsertDocument(userA.getId(), docsConnectionA.getId(), "drive-file-1", "Interview notes v1");
        upsertDocument(userA.getId(), docsConnectionA.getId(), "drive-file-1", "Interview notes v2 (edited)");

        List<ImportedDocument> stored = documentRepository.findAllByUserId(userA.getId());
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getTitle()).isEqualTo("Interview notes v2 (edited)");
    }

    @Test
    void listAllReturnsOnlyTheRequestingUsersItemsAcrossAllThreeSourceTypes() {
        upsertDocument(userA.getId(), docsConnectionA.getId(), "doc-1", "My notes");

        Connection emailConnA = connectionRepository.save(newConnection(userA, ConnectionProvider.GOOGLE_GMAIL));
        ImportedEmail email = new ImportedEmail();
        email.setUserId(userA.getId());
        email.setConnectionId(emailConnA.getId());
        email.setSourceId("msg-1");
        email.setSubject("Interview scheduled");
        email.setSyncStatus(SyncStatus.SYNCED);
        emailRepository.save(email);

        Connection githubConnA = connectionRepository.save(newConnection(userA, ConnectionProvider.GITHUB));
        ImportedGitHubItem item = new ImportedGitHubItem();
        item.setUserId(userA.getId());
        item.setConnectionId(githubConnA.getId());
        item.setSourceId("owner/repo#1");
        item.setItemType(GitHubItemType.ISSUE);
        item.setRepoFullName("owner/repo");
        item.setTitle("Fix bug");
        item.setUrl("https://github.com/owner/repo/issues/1");
        item.setState("open");
        item.setSyncStatus(SyncStatus.SYNCED);
        githubItemRepository.save(item);

        // Data belonging to a different user must never appear in A's list.
        Connection docsConnectionB = connectionRepository.save(newConnection(userB, ConnectionProvider.GOOGLE_DOCS));
        upsertDocument(userB.getId(), docsConnectionB.getId(), "doc-b1", "Bob's private notes");

        List<ImportedItemDto> items = service.listAll(userA.getId());

        assertThat(items).hasSize(3);
        assertThat(items).extracting(ImportedItemDto::type)
            .containsExactlyInAnyOrder(ImportedItemType.DOCUMENT, ImportedItemType.EMAIL, ImportedItemType.GITHUB_ITEM);
        assertThat(items).extracting(ImportedItemDto::title).doesNotContain("Bob's private notes");
    }

    @Test
    void setIncludedTogglesTheFlagAndIsScopedToTheOwningUser() {
        ImportedDocument doc = upsertDocument(userA.getId(), docsConnectionA.getId(), "doc-2", "Study notes");
        String compositeId = ImportedItemDto.compositeId(ImportedItemType.DOCUMENT, doc.getId());

        ImportedItemDto updated = service.setIncluded(userA.getId(), compositeId, false);
        assertThat(updated.includedInPlanning()).isFalse();

        assertThatThrownBy(() -> service.setIncluded(userB.getId(), compositeId, true))
            .as("user B must not be able to modify user A's imported item")
            .isInstanceOf(NotFoundException.class);
    }

    @Test
    void deleteRemovesTheRowAndIsScopedToTheOwningUser() {
        ImportedDocument doc = upsertDocument(userA.getId(), docsConnectionA.getId(), "doc-3", "Old notes");
        String compositeId = ImportedItemDto.compositeId(ImportedItemType.DOCUMENT, doc.getId());

        assertThatThrownBy(() -> service.delete(userB.getId(), compositeId)).isInstanceOf(NotFoundException.class);
        assertThat(documentRepository.findById(doc.getId())).isPresent();

        service.delete(userA.getId(), compositeId);
        assertThat(documentRepository.findById(doc.getId())).isEmpty();
    }

    @Test
    void rejectsAMalformedCompositeId() {
        assertThatThrownBy(() -> service.setIncluded(userA.getId(), "not-a-valid-id", true))
            .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.setIncluded(userA.getId(), "DOCUMENT:not-a-uuid", true))
            .isInstanceOf(NotFoundException.class);
    }
}
