import * as WebBrowser from 'expo-web-browser';
import { getGitHubInstallUrl, linkGitHubInstallation, startOAuth } from './api';
import type { ConnectionDto, ConnectionProviderId } from './types';

// Must exactly match `sortme.oauth-redirect-uri` on the backend. Expo Go
// cannot intercept a custom scheme like this -- see the dev-client
// requirement noted in app.json / the setup instructions. Google also
// rejects a custom-scheme redirect URI on the OAuth client this backend
// uses, which is why the code exchange itself happens at a backend-owned
// HTTPS callback, not here: this app only ever opens a browser and waits
// for that backend to redirect back to this one fixed URL when it's done.
export const OAUTH_REDIRECT_URI = 'sortme://oauth-redirect';

WebBrowser.maybeCompleteAuthSession();

export class OAuthCancelledError extends Error {
  constructor(message = 'Sign-in was cancelled') {
    super(message);
  }
}

/**
 * Opens the system browser for one Google or GitHub connection and waits
 * for the backend's own redirect back to this app. This app never sees an
 * authorization code, a PKCE verifier, or a provider token at any point --
 * see ConnectionService#completeOAuthCallback on the backend for where the
 * exchange actually happens.
 */
export async function connectProvider(provider: ConnectionProviderId): Promise<void> {
  const { authorizeUrl } = await startOAuth(provider);

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, OAUTH_REDIRECT_URI);
  if (result.type !== 'success' || !result.url) {
    throw new OAuthCancelledError();
  }

  const redirectUrl = new URL(result.url);
  const outcome = redirectUrl.searchParams.get('result');
  if (outcome === 'error') {
    const reason = redirectUrl.searchParams.get('reason') ?? 'unknown_error';
    throw new Error(`Sign-in failed: ${reason}`);
  }
  if (outcome !== 'connected') {
    throw new Error('Unexpected response from sign-in');
  }
}

/**
 * The GitHub App installation step (repository selection happens on
 * GitHub's own UI, not ours). Must be called after a successful
 * connectProvider('GITHUB') so the backend can verify the installation
 * belongs to the account that just authenticated -- see
 * ConnectionService#linkGitHubInstallation.
 */
export async function installGitHubApp(): Promise<ConnectionDto> {
  const { installUrl } = await getGitHubInstallUrl();
  const result = await WebBrowser.openAuthSessionAsync(installUrl, OAUTH_REDIRECT_URI);
  if (result.type !== 'success' || !result.url) {
    throw new OAuthCancelledError('Repository selection was cancelled');
  }
  const redirectUrl = new URL(result.url);
  const installationId = redirectUrl.searchParams.get('installationId');
  if (!installationId) {
    throw new Error('GitHub did not return an installation id');
  }
  return linkGitHubInstallation(installationId);
}
