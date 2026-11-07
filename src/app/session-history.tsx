import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { elapsedMs } from '../focus/sessionEngine';
import type { FocusOutcome, FocusSession } from '../focus/types';
import { useFocusSessions } from '../state/FocusSessionContext';

const OUTCOME_LABEL: Record<FocusOutcome, string> = {
  completed: 'Completed',
  partial: 'Partly completed',
  blocked: 'Blocked',
};

const OUTCOME_COLOR: Record<FocusOutcome, string> = {
  completed: colors.success,
  partial: colors.warning,
  blocked: colors.danger,
};

function SessionRow({ session }: { session: FocusSession }) {
  // Every session in this list has already ended (see the `ended` filter
  // below), so endedAt is always set here; falling back to startedAt keeps
  // this a pure function of the session's own data rather than reading the
  // clock during render.
  const clockMs = new Date(session.endedAt ?? session.startedAt).getTime();
  const actualMinutes = Math.round(elapsedMs(session, clockMs) / 60_000);
  const diff = actualMinutes - session.estimateMinutes;
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{session.taskTitle}</Text>
        {session.outcome && (
          <Text style={[styles.badge, { color: OUTCOME_COLOR[session.outcome] }]}>{OUTCOME_LABEL[session.outcome]}</Text>
        )}
      </View>
      <Text style={styles.rowSubtitle}>
        {actualMinutes} min actual vs {session.estimateMinutes} min estimated
        {diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff} min)` : ''}
      </Text>
      <Text style={styles.rowMeta}>{new Date(session.startedAt).toLocaleString()}</Text>
      {!!session.note && <Text style={styles.rowNote}>{session.note}</Text>}
    </View>
  );
}

export default function SessionHistoryScreen() {
  const { sessions } = useFocusSessions();
  const ended = [...sessions]
    .filter((s) => s.status === 'completed' || s.status === 'stopped')
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FlatList
        data={ended}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => <SessionRow session={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No focus sessions yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
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
  rowTitle: { ...typography.bodyStrong, fontSize: 15, color: colors.text },
  badge: { ...typography.label },
  rowSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowNote: { ...typography.caption, color: colors.text, marginTop: spacing.xs, fontStyle: 'italic' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
