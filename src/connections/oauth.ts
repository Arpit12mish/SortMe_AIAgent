import * as WebBrowser from 'expo-web-browser';
import { exchangeOAuth, getGitHubInstallUrl, linkGitHubInstallation, startOAuth } from './api';
import { generatePkcePair } from './pkce';
import type { ConnectionDto, ConnectionProviderId } from './types';

// Must exactly match `sortme.oauth-redirect-uri` on the backend and the
// redirect URI registered with each provider console. Expo Go cannot
// intercept a custom scheme like this -- see the dev-client requirement
// noted in app.json / the setup instructions.
export const OAUTH_REDIRECT_URI = 'sortme://oauth-redirect';

WebBrowser.maybeCompleteAuthSession();

export class OAuthCancelledError extends Error {
  constructor(message = 'Sign-in was cancelled') {
    super(message);
  }
}

/**
 * Runs one PKCE-protected OAuth round trip for a Google or GitHub
 * connection: generate a verifier/challenge on-device, ask the backend to
 * mint an authorize URL + CSRF state, open the system browser, and forward
 * the returned code (never the resulting tokens) back to the backend to
 * complete the exchange server-side.
 */
export async function connectProvider(provider: ConnectionProviderId): Promise<ConnectionDto> {
  const { verifier, challenge } = await generatePkcePair();
  const { authorizeUrl, state } = await startOAuth(provider, challenge);

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, OAUTH_REDIRECT_URI);
  if (result.type !== 'success' || !result.url) {
    throw new OAuthCancelledError();
  }

  const redirectUrl = new URL(result.url);
  const code = redirectUrl.searchParams.get('code');
  const returnedState = redirectUrl.searchParams.get('state');
  const providerError = redirectUrl.searchParams.get('error');
  if (providerError) {
    throw new Error(`Sign-in failed: ${providerError}`);
  }
  if (!code || !returnedState) {
    throw new Error('The provider did not return an authorization code');
  }
  if (returnedState !== state) {
    // The backend independently verifies `state` server-side (the real
    // authority); this is a client-side sanity check, not the defense.
    throw new Error('OAuth state mismatch');
  }

  return exchangeOAuth(provider, { code, codeVerifier: verifier, state: returnedState });
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
