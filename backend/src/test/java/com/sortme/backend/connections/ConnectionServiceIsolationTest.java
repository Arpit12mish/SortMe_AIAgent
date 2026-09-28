package com.sortme.backend.connections;

import com.sortme.backend.crypto.TokenCipher;
import com.sortme.backend.exception.InvalidOAuthStateException;
import com.sortme.backend.github.GitHubApiClient;
import com.sortme.backend.github.GitHubUserOAuthClient;
import com.sortme.backend.google.GoogleOAuthClient;
import com.sortme.backend.user.User;
import com.sortme.backend.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

/**
 * Runs against the real local `sortme_test_db` Postgres instance (Flyway
 * migrates it on context start). External provider clients are mocked so
 * these tests never make a real network call to Google/GitHub.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ConnectionServiceIsolationTest {

    @Autowired
    private ConnectionService connectionService;
    @Autowired
    private ConnectionRepository connectionRepository;
    @Autowired
    private GitHubSelectedRepoRepository githubReposRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TokenCipher tokenCipher;

    @MockBean
    private GoogleOAuthClient googleOAuthClient;
    @MockBean
    private GitHubUserOAuthClient gitHubUserOAuthClient;
    @MockBean
    private GitHubApiClient gitHubApiClient;

    private User userA;
    private User userB;

    @BeforeEach
    void setUp() {
        userA = userRepository.save(new User("install-" + UUID.randomUUID()));
        userB = userRepository.save(new User("install-" + UUID.randomUUID()));
    }

    private Connection persistConnection(User user, ConnectionProvider provider, String label) {
        Connection c = new Connection();
        c.setUserId(user.getId());
        c.setProvider(provider);
        c.setStatus(ConnectionStatus.CONNECTED);
        c.setExternalAccountLabel(label);
        c.setAccessTokenEnc(tokenCipher.encrypt("fake-access-token-for-" + label));
        c.setRefreshTokenEnc(tokenCipher.encrypt("fake-refresh-token-for-" + label));
        return connectionRepository.save(c);
    }

    @Test
    void userCannotSeeAnotherUsersConnections() {
        persistConnection(userA, ConnectionProvider.GOOGLE_DOCS, "alice@example.com");
        persistConnection(userB, ConnectionProvider.GOOGLE_DOCS, "bob@example.com");

        List<ConnectionDto> aConnections = connectionService.listConnections(userA.getId());
        ConnectionDto aDocs = aConnections.stream().filter(c -> c.provider() == ConnectionProvider.GOOGLE_DOCS).findFirst().orElseThrow();

        assertThat(aDocs.externalAccountLabel()).isEqualTo("alice@example.com");
        assertThat(aDocs.status()).isEqualTo(ConnectionStatus.CONNECTED);

        assertThat(connectionService.findForSync(userB.getId(), ConnectionProvider.GOOGLE_DOCS))
            .as("user B's own connection is unaffected")
            .isPresent();
        assertThat(connectionRepository.findByUserIdAndProvider(userA.getId(), ConnectionProvider.GOOGLE_DOCS))
            .as("user A's connection row belongs only to user A")
            .get()
            .extracting(Connection::getUserId)
            .isEqualTo(userA.getId());
    }

    @Test
    void disconnectClearsTokensAndStopsFutureSyncEvenWhenRevokeFails() {
        Connection connection = persistConnection(userA, ConnectionProvider.GOOGLE_GMAIL, "alice@example.com");
        doThrow(new RuntimeException("network unreachable")).when(googleOAuthClient).revoke(any());

        assertThatCode(() -> connectionService.disconnect(userA.getId(), ConnectionProvider.GOOGLE_GMAIL, false))
            .as("a failing best-effort revoke must not block local disconnect")
            .doesNotThrowAnyException();

        Connection reloaded = connectionRepository.findById(connection.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ConnectionStatus.DISCONNECTED);
        assertThat(reloaded.getAccessTokenEnc()).isNull();
        assertThat(reloaded.getRefreshTokenEnc()).isNull();
        assertThat(connectionService.findForSync(userA.getId(), ConnectionProvider.GOOGLE_GMAIL)).isEmpty();
    }

    @Test
    void disconnectIsIdempotentWhenAlreadyDisconnected() {
        assertThatCode(() -> connectionService.disconnect(userA.getId(), ConnectionProvider.GITHUB, false))
            .as("disconnecting a provider that was never connected must not throw")
            .doesNotThrowAnyException();
    }

    @Test
    void linkingAGitHubInstallationRejectsOneOwnedByADifferentAccount() {
        persistConnection(userA, ConnectionProvider.GITHUB, "alice-gh");
        when(gitHubApiClient.getInstallation("999")).thenReturn(
            new GitHubApiClient.Installation(999L, new GitHubApiClient.Account("someone-else"))
        );

        assertThatThrownBy(() -> connectionService.linkGitHubInstallation(userA.getId(), "999"))
            .as("must not let an enumerated installation_id be linked to the wrong account")
            .isInstanceOf(InvalidOAuthStateException.class);
    }

    @Test
    void linkingAGitHubInstallationSucceedsWhenAccountMatchesAndStoresSelectedRepos() {
        Connection connection = persistConnection(userA, ConnectionProvider.GITHUB, "alice-gh");
        when(gitHubApiClient.getInstallation("42")).thenReturn(
            new GitHubApiClient.Installation(42L, new GitHubApiClient.Account("alice-gh"))
        );
        when(gitHubApiClient.mintInstallationToken("42")).thenReturn("fake-installation-token");
        when(gitHubApiClient.listInstallationRepositories("fake-installation-token")).thenReturn(
            List.of(new GitHubApiClient.Repo(1L, "alice/one", false), new GitHubApiClient.Repo(2L, "alice/two", true))
        );

        ConnectionDto result = connectionService.linkGitHubInstallation(userA.getId(), "42");

        assertThat(result.installed()).isTrue();
        assertThat(result.selectedRepos()).containsExactlyInAnyOrder("alice/one", "alice/two");
        assertThat(githubReposRepository.findAllByConnectionId(connection.getId())).hasSize(2);
    }
}
