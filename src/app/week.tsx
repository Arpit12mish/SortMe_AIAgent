import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { addDaysToISODate, formatDateLabel } from '../planning/time';
import { useAppState } from '../state/AppStateContext';

const WEEK_WINDOW_DAYS = 7;

type DayStatus = 'today' | 'needs-review' | 'accepted' | 'not-generated';

const STATUS_LABEL: Record<DayStatus, string> = {
  today: 'Today',
  'needs-review': 'Needs review',
  accepted: 'Accepted',
  'not-generated': 'Not generated',
};

const STATUS_COLOR: Record<DayStatus, string> = {
  today: colors.primary,
  'needs-review': colors.warning,
  accepted: colors.success,
  'not-generated': colors.textMuted,
};

export default function WeekScreen() {
  const router = useRouter();
  const { activeDate, planForDate } = useAppState();

  const dates = useMemo(
    () => Array.from({ length: WEEK_WINDOW_DAYS }, (_, i) => addDaysToISODate(activeDate, i)),
    [activeDate]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Next 7 days</Text>
        <Text style={styles.subtitle}>
          Open a date to see its fixed commitments, travel time, meals, tasks, and conflicts.
        </Text>

        {dates.map((date) => {
          const { current, proposed } = planForDate(date);
          const status: DayStatus = proposed
            ? 'needs-review'
            : current
              ? 'accepted'
              : date === activeDate
                ? 'today'
                : 'not-generated';
          const plan = current ?? proposed;
          const scheduledCount = plan?.blocks.filter((b) => b.taskId).length ?? 0;
          const doesntFitCount = plan ? plan.unscheduledTasks.length + plan.atRiskTasks.length : 0;

          return (
            <PressableScale key={date} style={styles.card} onPress={() => router.push(`/day/${date}`)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>
                  {formatDateLabel(date)}
                  {date === activeDate ? ' · Today' : ''}
                </Text>
                <Text style={[styles.statusPill, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
              </View>
              {plan && (
                <View style={styles.cardBody}>
                  <Text style={styles.cardMeta}>{scheduledCount} task(s) scheduled</Text>
                  {doesntFitCount > 0 && (
                    <Text style={styles.cardWarning}>{doesntFitCount} doesn&apos;t fit</Text>
                  )}
                </View>
              )}
            </PressableScale>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { ...typography.bodyStrong, color: colors.text },
  statusPill: { ...typography.label, textTransform: 'uppercase' },
  cardBody: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  cardMeta: { ...typography.caption, color: colors.textMuted },
  cardWarning: { ...typography.caption, color: colors.danger, fontWeight: '600' },
});
