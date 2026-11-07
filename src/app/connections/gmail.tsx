import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import type { ImportedItemDto } from '../../connections/types';
import { todayLocalDate } from '../../checkins/checkinEngine';
import { addDaysToISODate } from '../../planning/time';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_WINDOW_DAYS = 30;

function EmailRow({ email }: { email: ImportedItemDto }) {
  const { setItemIncluded, deleteItem } = useConnectionsState();
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{email.title ?? '(no subject)'}</Text>
      {email.timestamp && <Text style={styles.rowMeta}>{new Date(email.timestamp).toLocaleString()}</Text>}
      {email.preview && (
        <Text style={styles.rowPreview} numberOfLines={3}>
          {email.preview}
        </Text>
      )}
      <Text style={styles.rowMeta}>{email.includedInPlanning ? 'Included in planning' : 'Excluded from planning'}</Text>
      <View style={styles.rowActions}>
        {email.link && <SecondaryButton label="Open" onPress={() => Linking.openURL(email.link!)} />}
        <SecondaryButton
          label={email.includedInPlanning ? 'Exclude' : 'Include'}
          onPress={() => setItemIncluded(email.id, !email.includedInPlanning)}
        />
        <SecondaryButton
          label="Remove"
          onPress={() =>
            Alert.alert('Remove this email?', 'This deletes the imported copy; nothing changes in Gmail.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => deleteItem(email.id) },
            ])
          }
        />
      </View>
    </View>
  );
}

export default function GmailScreen() {
  const router = useRouter();
  const { connections, importedItems, refreshConnections, refreshImportedItems, syncGmailNow, loading } =
    useConnectionsState();
  // A visible, user-adjustable rolling window -- defaults to the past 30
  // days rather than an invisible backend fallback, so "sync now" always
  // syncs the exact range shown, and the user can widen or narrow it.
  const [from, setFrom] = useState(() => addDaysToISODate(todayLocalDate(), -DEFAULT_WINDOW_DAYS));
  const [to, setTo] = useState(() => todayLocalDate());
  const [searchTerms, setSearchTerms] = useState('interview OR deadline OR offer');

  useEffect(() => {
    refreshConnections();
    refreshImportedItems();
  }, [refreshConnections, refreshImportedItems]);

  const connection = connections.find((c) => c.provider === 'GOOGLE_GMAIL');
  const emails = importedItems.filter((i) => i.type === 'EMAIL');

  const datesValid = (from === '' || DATE_RE.test(from)) && (to === '' || DATE_RE.test(to));

  const handleSync = async () => {
    if (!datesValid) {
      Alert.alert('Check the dates', 'Use YYYY-MM-DD, e.g. 2026-09-01.');
      return;
    }
    try {
      await syncGmailNow({ from: from || undefined, to: to || undefined, searchTerms: searchTerms || undefined });
    } catch {
      Alert.alert('Sync failed', 'Could not fetch emails right now. Try again shortly.');
    }
  };

  if (!connection || connection.status === 'DISCONNECTED') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Connect Gmail from the Connect tab first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>
          Choose a bounded date range and optional search terms — defaults to the last {DEFAULT_WINDOW_DAYS} days,
          widen it as you like. SortMe never sends, modifies, or deletes mail -- these are read-only candidates for
          you to review below.
        </Text>

        {connection.lastSyncAt && (
          <Text style={styles.syncMeta}>
            Last synced {new Date(connection.lastSyncAt).toLocaleString()}
            {connection.lastSyncError ? ` — ${connection.lastSyncError}` : ''}
          </Text>
        )}

        <View style={styles.form}>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>From</Text>
              <TextInput
                value={from}
                onChangeText={setFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>To</Text>
              <TextInput
                value={to}
                onChangeText={setTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          </View>
          <Text style={styles.label}>Search terms (optional)</Text>
          <TextInput value={searchTerms} onChangeText={setSearchTerms} style={styles.input} />
          <PrimaryButton label="Sync now" onPress={handleSync} loading={loading} />
        </View>

        <View style={styles.aiActions}>
          <SecondaryButton
            label="Scan for interviews & tasks"
            onPress={() => router.push('/daily-briefing?autoScanGmail=1')}
          />
          <SecondaryButton
            label="Suggest tasks from these emails"
            onPress={() => router.push('/connections/gmail-task-suggestions')}
          />
          <SecondaryButton
            label="Find emails awaiting your reply"
            onPress={() => router.push('/connections/gmail-needs-reply')}
          />
        </View>

        {emails.length === 0 ? (
          <Text style={[styles.helper, { marginTop: spacing.lg }]}>No emails imported yet.</Text>
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {emails.map((email) => (
              <EmailRow key={email.id} email={email} />
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
  syncMeta: { ...typography.caption, fontSize: 12, color: colors.textFaint, marginBottom: spacing.md },
  form: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  aiActions: { marginTop: spacing.md, gap: spacing.sm },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  label: { ...typography.caption, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
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
  rowPreview: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
