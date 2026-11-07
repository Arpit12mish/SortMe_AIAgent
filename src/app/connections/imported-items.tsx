import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import type { ImportedItemDto, ImportedItemType } from '../../connections/types';

const TYPE_LABEL: Record<ImportedItemType, string> = {
  DOCUMENT: 'Google Doc',
  EMAIL: 'Email',
  GITHUB_ITEM: 'GitHub',
};

const FILTERS: { label: string; value: ImportedItemType | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Docs', value: 'DOCUMENT' },
  { label: 'Email', value: 'EMAIL' },
  { label: 'GitHub', value: 'GITHUB_ITEM' },
];

function Row({ item }: { item: ImportedItemDto }) {
  const { setItemIncluded, deleteItem } = useConnectionsState();
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.typeBadge}>{TYPE_LABEL[item.type]}</Text>
        {item.syncStatus === 'ERROR' && <Text style={styles.errorBadge}>SYNC ERROR</Text>}
      </View>
      <Text style={styles.rowTitle}>{item.title ?? '(untitled)'}</Text>
      {item.timestamp && <Text style={styles.rowMeta}>{new Date(item.timestamp).toLocaleString()}</Text>}
      {item.preview && (
        <Text style={styles.rowPreview} numberOfLines={2}>
          {item.preview}
        </Text>
      )}
      <View style={styles.rowActions}>
        {item.link && <SecondaryButton label="Open" onPress={() => Linking.openURL(item.link!)} />}
        <SecondaryButton
          label={item.includedInPlanning ? 'Included ✓' : 'Excluded'}
          onPress={() => setItemIncluded(item.id, !item.includedInPlanning)}
        />
        <SecondaryButton
          label="Remove"
          onPress={() =>
            Alert.alert('Remove this item?', 'This only deletes the imported copy in SortMe.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => deleteItem(item.id) },
            ])
          }
        />
      </View>
    </View>
  );
}

export default function ImportedItemsScreen() {
  const { importedItems, refreshImportedItems } = useConnectionsState();
  const [filter, setFilter] = useState<ImportedItemType | 'ALL'>('ALL');

  useEffect(() => {
    refreshImportedItems();
  }, [refreshImportedItems]);

  const filtered = useMemo(
    () => (filter === 'ALL' ? importedItems : importedItems.filter((i) => i.type === filter)),
    [importedItems, filter]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <PressableScale
            key={f.value}
            onPress={() => setFilter(f.value)}
            scaleTo={0.93}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, filter === f.value && styles.filterChipTextActive]}>{f.label}</Text>
          </PressableScale>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <Row item={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nothing imported yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  filterRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.lg, paddingBottom: spacing.sm },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted },
  filterChipTextActive: { color: colors.primaryText },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  typeBadge: { ...typography.label, color: colors.primary },
  errorBadge: { ...typography.label, color: colors.danger },
  rowTitle: { ...typography.bodyStrong, color: colors.text, marginTop: 2 },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowPreview: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
