import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import type { ImportedItemDto } from '../../connections/types';

/** `doc.id` is the composite "DOCUMENT:<uuid>" ImportedItemDto.compositeId()
 * builds server-side -- the AI endpoints take the raw uuid. */
function rawDocumentId(compositeId: string): string {
  return compositeId.split(':')[1] ?? compositeId;
}

function DocRow({ doc }: { doc: ImportedItemDto }) {
  const router = useRouter();
  const { setItemIncluded, deleteItem, importGoogleDocs } = useConnectionsState();

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{doc.title ?? 'Untitled document'}</Text>
        {doc.timestamp && <Text style={styles.rowMeta}>Modified {new Date(doc.timestamp).toLocaleString()}</Text>}
        {doc.syncStatus === 'ERROR' && <Text style={styles.rowError}>Sync error</Text>}
        <Text style={styles.rowMeta}>{doc.includedInPlanning ? 'Included in planning' : 'Excluded from planning'}</Text>
      </View>
      <View style={styles.rowActions}>
        {doc.link && <SecondaryButton label="Open" onPress={() => Linking.openURL(doc.link!)} />}
        <SecondaryButton
          label="Generate quiz questions"
          onPress={() =>
            router.push({
              pathname: '/connections/google-docs-questions',
              params: { rawDocId: rawDocumentId(doc.id), title: doc.title ?? 'Untitled document' },
            })
          }
        />
        <SecondaryButton
          label={doc.includedInPlanning ? 'Exclude' : 'Include'}
          onPress={() => setItemIncluded(doc.id, !doc.includedInPlanning)}
        />
        <SecondaryButton label="Refresh" onPress={() => importGoogleDocs([doc.sourceId])} />
        <SecondaryButton
          label="Remove"
          onPress={() =>
            Alert.alert('Remove this document?', 'This deletes the imported copy; the file in Drive is unaffected.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => deleteItem(doc.id) },
            ])
          }
        />
      </View>
    </View>
  );
}

export default function GoogleDocsScreen() {
  const router = useRouter();
  const { connections, importedItems, refreshConnections, refreshImportedItems } = useConnectionsState();

  useEffect(() => {
    refreshConnections();
    refreshImportedItems();
  }, [refreshConnections, refreshImportedItems]);

  const connection = connections.find((c) => c.provider === 'GOOGLE_DOCS');
  const docs = importedItems.filter((i) => i.type === 'DOCUMENT');

  if (!connection || connection.status === 'DISCONNECTED') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Connect Google Docs from the Connect tab first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>
          Only documents you explicitly pick below are ever read. Nothing else in your Drive is visible to SortMe.
        </Text>
        <PrimaryButton label="Select documents" onPress={() => router.push('/connections/google-docs-picker')} />

        {docs.length === 0 ? (
          <Text style={[styles.helper, { marginTop: spacing.lg }]}>No documents imported yet.</Text>
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {docs.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
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
  rowError: { ...typography.caption, fontSize: 12, color: colors.danger, marginTop: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
