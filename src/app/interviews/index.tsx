import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { todayLocalDate } from '../../checkins/checkinEngine';
import { dueFollowUps, OUTCOME_LABEL, STAGE_LABEL } from '../../prep/interviewEngine';
import type { InterviewEntry } from '../../prep/types';
import { usePrepState } from '../../state/PrepStateContext';
import { useReminders } from '../../state/ReminderStateContext';

function InterviewRow({ entry, isDueFollowUp }: { entry: InterviewEntry; isDueFollowUp: boolean }) {
  const router = useRouter();
  return (
    <PressableScale style={styles.row} onPress={() => router.push({ pathname: '/interviews/[id]', params: { id: entry.id } })}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>
          {entry.company} — {entry.role}
        </Text>
        <Text style={styles.badge}>{STAGE_LABEL[entry.stage]}</Text>
      </View>
      <Text style={styles.rowSubtitle}>{OUTCOME_LABEL[entry.outcome]}</Text>
      {isDueFollowUp && <Text style={styles.followUpBadge}>Suggested follow-up: {entry.followUpDate}</Text>}
    </PressableScale>
  );
}

export default function InterviewsScreen() {
  const router = useRouter();
  const { interviews } = usePrepState();
  const { enabled: remindersEnabled, syncFollowUpReminders } = useReminders();
  const today = useMemo(() => todayLocalDate(), []);
  const due = useMemo(() => dueFollowUps(interviews, today), [interviews, today]);
  const dueIds = new Set(due.map((e) => e.id));

  useEffect(() => {
    if (remindersEnabled) syncFollowUpReminders(interviews);
  }, [remindersEnabled, interviews, syncFollowUpReminders]);

  const sorted = [...interviews].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <PrimaryButton label="+ New interview" onPress={() => router.push('/interviews/new')} />
      </View>

      {due.length > 0 && (
        <View style={styles.followUpSection}>
          <Text style={styles.followUpTitle}>Suggested follow-ups ({due.length})</Text>
          <Text style={styles.followUpHint}>These are just reminders — nothing is sent automatically.</Text>
        </View>
      )}

      <FlatList
        data={sorted}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => <InterviewRow entry={item} isDueFollowUp={dueIds.has(item.id)} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No interviews tracked yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  followUpSection: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.tintWarning,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  followUpTitle: { fontWeight: '700', color: colors.text },
  followUpHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
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
  rowTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text, flex: 1 },
  badge: { ...typography.label, color: colors.textMuted },
  rowSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  followUpBadge: { ...typography.caption, color: colors.warning, marginTop: spacing.xs, fontWeight: '600' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
