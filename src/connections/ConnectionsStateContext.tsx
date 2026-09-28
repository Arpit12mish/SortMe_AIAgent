import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as api from './api';
import type { GmailSyncParams } from './api';
import { connectProvider, installGitHubApp } from './oauth';
import type { ConnectionDto, ConnectionProviderId, ImportedItemDto } from './types';
import { ApiError } from './types';

interface ConnectionsStateValue {
  loading: boolean;
  connections: ConnectionDto[];
  importedItems: ImportedItemDto[];
  lastError: string | null;
  refreshConnections: () => Promise<void>;
  refreshImportedItems: () => Promise<void>;
  connect: (provider: ConnectionProviderId) => Promise<void>;
  connectGitHubRepos: () => Promise<void>;
  disconnect: (provider: ConnectionProviderId, deleteImportedData: boolean) => Promise<void>;
  importGoogleDocs: (fileIds: string[]) => Promise<void>;
  syncGmailNow: (params: GmailSyncParams) => Promise<void>;
  syncGitHubNow: () => Promise<void>;
  setItemIncluded: (id: string, included: boolean) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

const ConnectionsStateContext = createContext<ConnectionsStateValue | null>(null);

function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export function ConnectionsStateProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<ConnectionDto[]>([]);
  const [importedItems, setImportedItems] = useState<ImportedItemDto[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshConnections = useCallback(async () => {
    try {
      setConnections(await api.listConnections());
      setLastError(null);
    } catch (e) {
      setLastError(describeError(e));
    }
  }, []);

  const refreshImportedItems = useCallback(async () => {
    try {
      setImportedItems(await api.listImportedItems());
      setLastError(null);
    } catch (e) {
      setLastError(describeError(e));
    }
  }, []);

  const runWithLoading = useCallback(async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
      setLastError(null);
    } catch (e) {
      setLastError(describeError(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(
    (provider: ConnectionProviderId) =>
      runWithLoading(async () => {
        await connectProvider(provider);
        await refreshConnections();
      }),
    [runWithLoading, refreshConnections]
  );

  const connectGitHubRepos = useCallback(
    () =>
      runWithLoading(async () => {
        await installGitHubApp();
        await refreshConnections();
      }),
    [runWithLoading, refreshConnections]
  );

  const disconnect = useCallback(
    (provider: ConnectionProviderId, deleteImportedData: boolean) =>
      runWithLoading(async () => {
        await api.disconnectProvider(provider, deleteImportedData);
        await refreshConnections();
        if (deleteImportedData) await refreshImportedItems();
      }),
    [runWithLoading, refreshConnections, refreshImportedItems]
  );

  const importGoogleDocs = useCallback(
    (fileIds: string[]) =>
      runWithLoading(async () => {
        await api.importGoogleDocsFiles(fileIds);
        await Promise.all([refreshConnections(), refreshImportedItems()]);
      }),
    [runWithLoading, refreshConnections, refreshImportedItems]
  );

  const syncGmailNow = useCallback(
    (params: GmailSyncParams) =>
      runWithLoading(async () => {
        await api.syncGmail(params);
        await Promise.all([refreshConnections(), refreshImportedItems()]);
      }),
    [runWithLoading, refreshConnections, refreshImportedItems]
  );

  const syncGitHubNow = useCallback(
    () =>
      runWithLoading(async () => {
        await api.syncGitHub();
        await Promise.all([refreshConnections(), refreshImportedItems()]);
      }),
    [runWithLoading, refreshConnections, refreshImportedItems]
  );

  const setItemIncluded = useCallback(
    async (id: string, included: boolean) => {
      const updated = await api.setImportedItemIncluded(id, included);
      setImportedItems((items) => items.map((i) => (i.id === id ? updated : i)));
    },
    []
  );

  const deleteItem = useCallback(async (id: string) => {
    await api.deleteImportedItem(id);
    setImportedItems((items) => items.filter((i) => i.id !== id));
  }, []);

  const value = useMemo<ConnectionsStateValue>(
    () => ({
      loading,
      connections,
      importedItems,
      lastError,
      refreshConnections,
      refreshImportedItems,
      connect,
      connectGitHubRepos,
      disconnect,
      importGoogleDocs,
      syncGmailNow,
      syncGitHubNow,
      setItemIncluded,
      deleteItem,
    }),
    [
      loading,
      connections,
      importedItems,
      lastError,
      refreshConnections,
      refreshImportedItems,
      connect,
      connectGitHubRepos,
      disconnect,
      importGoogleDocs,
      syncGmailNow,
      syncGitHubNow,
      setItemIncluded,
      deleteItem,
    ]
  );

  return <ConnectionsStateContext.Provider value={value}>{children}</ConnectionsStateContext.Provider>;
}

export function useConnectionsState(): ConnectionsStateValue {
  const ctx = useContext(ConnectionsStateContext);
  if (!ctx) throw new Error('useConnectionsState must be used within a ConnectionsStateProvider');
  return ctx;
}
