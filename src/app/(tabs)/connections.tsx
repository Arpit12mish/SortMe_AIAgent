import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, spacing } from '../../components/theme';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import type { ConnectionDto, ConnectionProviderId, ConnectionStatus } from '../../connections/types';

const PROVIDER_LABEL: Record<ConnectionProviderId, string> = {
  GOOGLE_DOCS: 'Google Docs',
  GOOGLE_GMAIL: 'Gmail',
  GITHUB: 'GitHub',
};

const PROVIDER_DESCRIPTION: Record<ConnectionProviderId, string> = {
  GOOGLE_DOCS: 'Read only the documents you choose, via the Google Picker.',
  GOOGLE_GMAIL: 'Read-only, bounded by date range and search terms you set.',
  GITHUB: 'Read-only issues and pull requests from repositories you select.',
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  CONNECTED: colors.success,
  DISCONNECTED: colors.textMuted,
  ERROR: colors.danger,
  EXPIRED: colors.warning,
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  CONNECTED: 'Connected',
  DISCONNECTED: 'Not connected',
  ERROR: 'Error',
  EXPIRED: 'Reconnect needed',
};

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced';
  return `Last sync: ${new Date(iso).toLocaleString()}`;
}

function ConnectionCard({ connection, onManage }: { connection: ConnectionDto; onManage: () => void }) {
  const { connect, disconnect, loading } = useConnectionsState();

  const handleConnect = async () => {
    try {
      await connect(connection.provider);
    } catch {
      Alert.alert('Could not connect', 'Check the connection and try again.');
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect ' + PROVIDER_LABEL[connection.provider] + '?', 'This stops future syncing immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect, keep imported data',
        onPress: () => disconnect(connection.provider, false).catch(() => Alert.alert('Could not disconnect')),
      },
      {
        text: 'Disconnect and delete imported data',
        style: 'destructive',
        onPress: () => disconnect(connection.provider, true).catch(() => Alert.alert('Could not disconnect')),
      },
    ]);
  };

  const connected = connection.status === 'CONNECTED' || connection.status === 'EXPIRED';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{PROVIDER_LABEL[connection.provider]}</Text>
        <Text style={[styles.statusBadge, { color: STATUS_COLOR[connection.status] }]}>
          {STATUS_LABEL[connection.status]}
        </Text>
      </View>
      <Text style={styles.cardDescription}>{PROVIDER_DESCRIPTION[connection.provider]}</Text>

      {connection.externalAccountLabel && (
        <Text style={styles.detailLine}>Account: {connection.externalAccountLabel}</Text>
      )}
      {connection.provider === 'GITHUB' && connection.installed && (
        <Text style={styles.detailLine}>
          {connection.selectedRepos.length} repositor{connection.selectedRepos.length === 1 ? 'y' : 'ies'} selected
        </Text>
      )}
      {connected && <Text style={styles.detailLine}>{formatLastSync(connection.lastSyncAt)}</Text>}
      {connection.lastSyncStatus === 'ERROR' && connection.lastSyncError && (
        <Text style={styles.errorLine}>Sync error: {connection.lastSyncError}</Text>
      )}

      <View style={styles.cardActions}>
        {connected ? (
          <>
            <SecondaryButton label="Manage" onPress={onManage} />
            <SecondaryButton label="Disconnect" onPress={handleDisconnect} />
          </>
        ) : (
          <PrimaryButton label="Connect" onPress={handleConnect} loading={loading} />
        )}
      </View>
    </View>
  );
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const { connections, refreshConnections, loading } = useConnectionsState();

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  const byProvider = (provider: ConnectionProviderId) =>
    connections.find((c) => c.provider === provider) ?? {
      provider,
      status: 'DISCONNECTED' as const,
      externalAccountLabel: null,
      grantedScopes: null,
      installed: false,
      selectedRepos: [],
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
    };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshConnections} />}
      >
        <Text style={styles.title}>Connect</Text>
        <Text style={styles.helper}>
          Google Docs and Gmail are independent -- connect one without the other. Nothing here becomes a planner
          task automatically; review imported items and choose what to include.
        </Text>

        <ConnectionCard connection={byProvider('GOOGLE_DOCS')} onManage={() => router.push('/connections/google-docs')} />
        <ConnectionCard connection={byProvider('GOOGLE_GMAIL')} onManage={() => router.push('/connections/gmail')} />
        <ConnectionCard connection={byProvider('GITHUB')} onManage={() => router.push('/connections/github')} />

        <View style={{ marginTop: spacing.lg }}>
          <SecondaryButton label="View imported items" onPress={() => router.push('/connections/imported-items')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  helper: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  statusBadge: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cardDescription: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  detailLine: { fontSize: 13, color: colors.text, marginTop: spacing.xs },
  errorLine: { fontSize: 13, color: colors.danger, marginTop: spacing.xs },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
