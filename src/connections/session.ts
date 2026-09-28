import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const INSTALL_ID_KEY = 'sortme.installId';
const SESSION_TOKEN_KEY = 'sortme.sessionToken';

/**
 * A stable, random id for this app installation -- not a Google/GitHub
 * identity and not a SortMe account (there is no login/password). It only
 * exists so the backend can tell one installation's connections apart from
 * another's. See backend DeviceAuthController for the server side.
 */
export async function getOrCreateInstallId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
  return id;
}

export async function getStoredSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function storeSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
