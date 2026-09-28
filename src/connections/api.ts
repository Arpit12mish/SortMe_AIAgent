import { ApiError, type ApiErrorBody, type ConnectionDto, type ConnectionProviderId, type ImportedItemDto } from './types';
import { getOrCreateInstallId, getStoredSessionToken, storeSessionToken } from './session';

/**
 * Where the backend is reachable. `localhost` only works for the iOS
 * Simulator; a physical iPhone or an Android emulator/device needs your
 * Mac's LAN IP here (same requirement as the Metro bundler URL). Set via
 * EXPO_PUBLIC_BACKEND_URL in a .env.local at the project root.
 */
function getBackendBaseUrl(): string {
  return process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';
}

async function ensureSessionToken(): Promise<string> {
  const existing = await getStoredSessionToken();
  if (existing) return existing;
  return bootstrapSession();
}

async function bootstrapSession(): Promise<string> {
  const installId = await getOrCreateInstallId();
  const res = await fetch(`${getBackendBaseUrl()}/api/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await safeParseError(res));
  }
  const body = (await res.json()) as { sessionToken: string };
  await storeSessionToken(body.sessionToken);
  return body.sessionToken;
}

async function safeParseError(res: Response): Promise<ApiErrorBody | null> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | boolean | undefined>;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const token = await ensureSessionToken();
  const url = new URL(path, getBackendBaseUrl());
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !isRetry) {
    // Session token expired/invalid: re-bootstrap once and retry, rather
    // than surfacing a confusing error for something the app can recover
    // from on its own.
    await storeSessionToken('');
    return apiFetch<T>(path, options, true);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await safeParseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- connections ----

export function listConnections(): Promise<ConnectionDto[]> {
  return apiFetch('/api/connections');
}

/**
 * Returns the URL to open in the system browser. The backend generates and
 * holds the PKCE pair itself and completes the whole authorization-code
 * exchange server-side when the provider redirects back to it -- see
 * src/connections/oauth.ts. This call carries no request body: there is
 * nothing sensitive for the client to contribute.
 */
export function startOAuth(provider: ConnectionProviderId): Promise<{ authorizeUrl: string }> {
  return apiFetch(`/api/connections/${provider}/start`, { method: 'POST' });
}

export function disconnectProvider(provider: ConnectionProviderId, deleteImportedData: boolean): Promise<void> {
  return apiFetch(`/api/connections/${provider}`, { method: 'DELETE', query: { deleteImportedData } });
}

export function getGitHubInstallUrl(): Promise<{ installUrl: string }> {
  return apiFetch('/api/connections/github/install-url');
}

export function linkGitHubInstallation(installationId: string): Promise<ConnectionDto> {
  return apiFetch('/api/connections/github/link-installation', { method: 'POST', body: { installationId } });
}

// ---- google docs ----

export function getGoogleDocsPickerUrl(): Promise<{ pickerUrl: string }> {
  return apiFetch('/api/connections/google-docs/picker-url');
}

export function importGoogleDocsFiles(fileIds: string[]): Promise<ImportedItemDto[]> {
  return apiFetch('/api/connections/google-docs/import', { method: 'POST', body: { fileIds } });
}

// ---- gmail ----

export interface GmailSyncParams {
  from?: string; // ISO date (yyyy-MM-dd)
  to?: string;
  searchTerms?: string;
}

export function syncGmail(params: GmailSyncParams): Promise<ImportedItemDto[]> {
  return apiFetch('/api/connections/gmail/sync', { method: 'POST', body: params });
}

// ---- github sync ----

export function syncGitHub(): Promise<ImportedItemDto[]> {
  return apiFetch('/api/connections/github/sync', { method: 'POST' });
}

// ---- imported items ----

export function listImportedItems(): Promise<ImportedItemDto[]> {
  return apiFetch('/api/imported-items');
}

export function setImportedItemIncluded(id: string, includedInPlanning: boolean): Promise<ImportedItemDto> {
  return apiFetch(`/api/imported-items/${encodeURIComponent(id)}`, { method: 'PATCH', body: { includedInPlanning } });
}

export function deleteImportedItem(id: string): Promise<void> {
  return apiFetch(`/api/imported-items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
