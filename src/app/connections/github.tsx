import React, { useEffect } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import type { ImportedItemDto } from '../../connections/types';

function ItemRow({ item }: { item: ImportedItemDto }) {
  const { setItemIncluded, deleteItem } = useConnectionsState();
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{item.title}</Text>
      <Text style={styles.rowMeta}>{item.preview}</Text>
      {item.timestamp && <Text style={styles.rowMeta}>Updated {new Date(item.timestamp).toLocaleString()}</Text>}
      <Text style={styles.rowMeta}>{item.includedInPlanning ? 'Included in planning' : 'Excluded from planning'}</Text>
      <View style={styles.rowActions}>
        {item.link && <SecondaryButton label="Open" onPress={() => Linking.openURL(item.link!)} />}
        <SecondaryButton
          label={item.includedInPlanning ? 'Exclude' : 'Include'}
          onPress={() => setItemIncluded(item.id, !item.includedInPlanning)}
        />
        <SecondaryButton
          label="Remove"
          onPress={() =>
            Alert.alert('Remove this item?', 'This deletes the imported copy; nothing changes on GitHub.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => deleteItem(item.id) },
            ])
          }
        />
      </View>
    </View>
  );
}

export default function GitHubScreen() {
  const {
    connections,
    importedItems,
    refreshConnections,
    refreshImportedItems,
    connectGitHubRepos,
    syncGitHubNow,
    loading,
  } = useConnectionsState();

  useEffect(() => {
    refreshConnections();
    refreshImportedItems();
  }, [refreshConnections, refreshImportedItems]);

  const connection = connections.find((c) => c.provider === 'GITHUB');
  const items = importedItems.filter((i) => i.type === 'GITHUB_ITEM');

  if (!connection || connection.status === 'DISCONNECTED') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Connect GitHub from the Connect tab first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSelectRepos = async () => {
    try {
      await connectGitHubRepos();
    } catch {
      Alert.alert('Could not open repository selection', 'Try again from the Connect tab.');
    }
  };

  const handleSync = async () => {
    try {
      await syncGitHubNow();
    } catch {
      Alert.alert('Sync failed', 'Could not fetch issues and pull requests right now.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>Read-only: SortMe never pushes code, changes issues, or posts comments.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>
            {connection.installed
              ? `${connection.selectedRepos.length} repositor${connection.selectedRepos.length === 1 ? 'y' : 'ies'} selected`
              : 'No repositories selected yet'}
          </Text>
          {connection.selectedRepos.map((repo) => (
            <Text key={repo} style={styles.rowMeta}>
              • {repo}
            </Text>
          ))}
          <SecondaryButton
            label={connection.installed ? 'Change selected repositories' : 'Select repositories on GitHub'}
            onPress={handleSelectRepos}
          />
          {connection.installed && <PrimaryButton label="Sync now" onPress={handleSync} loading={loading} />}
        </View>

        {items.length === 0 ? (
          <Text style={[styles.helper, { marginTop: spacing.lg }]}>No issues or pull requests imported yet.</Text>
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  helper: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  form: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  label: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
