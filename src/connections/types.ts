// Mirrors the backend's ConnectionDto / ImportedItemDto shapes exactly
// (see backend/src/main/java/com/sortme/backend/connections/ConnectionDto.java
// and backend/.../imported/ImportedItemDto.java). Keep in sync by hand --
// there is no shared schema between the two projects in this slice.

export type ConnectionProviderId = 'GOOGLE_DOCS' | 'GOOGLE_GMAIL' | 'GITHUB';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED';

export interface ConnectionDto {
  provider: ConnectionProviderId;
  status: ConnectionStatus;
  externalAccountLabel: string | null;
  grantedScopes: string | null;
  installed: boolean;
  selectedRepos: string[];
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export type ImportedItemType = 'DOCUMENT' | 'EMAIL' | 'GITHUB_ITEM';
export type SyncStatus = 'SYNCED' | 'ERROR';

export interface ImportedItemDto {
  id: string;
  type: ImportedItemType;
  source: string;
  sourceId: string;
  title: string | null;
  link: string | null;
  timestamp: string | null;
  syncStatus: SyncStatus;
  includedInPlanning: boolean;
  preview: string | null;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  retryable?: boolean | null;
  requiresReconnect?: boolean | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }

  get retryable(): boolean {
    return this.body?.retryable === true;
  }

  get requiresReconnect(): boolean {
    return this.body?.requiresReconnect === true || this.status === 401;
  }
}
