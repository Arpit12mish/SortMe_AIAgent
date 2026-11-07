import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { buildWeeklyReview } from '../focus/weeklyReview';
import { todayLocalDate } from '../checkins/checkinEngine';
import { useAppState } from '../state/AppStateContext';
import { useFocusSessions } from '../state/FocusSessionContext';

export default function WeeklyReviewScreen() {
  const { planVersions } = useAppState();
  const { sessions } = useFocusSessions();
  const review = useMemo(
    () => buildWeeklyReview(sessions, planVersions, todayLocalDate(), 7),
    [sessions, planVersions]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          A factual summary of the last 7 days, from your accepted plans and focus session history. Nothing here is a
          judgment — just what was planned and what happened.
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{Math.round(review.totalPlannedMinutes / 60)}h</Text>
            <Text style={styles.summaryLabel}>Planned</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{Math.round(review.totalActualMinutes / 60)}h</Text>
            <Text style={styles.summaryLabel}>Spent in sessions</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{review.totalSessionsCompleted}</Text>
            <Text style={styles.summaryLabel}>Sessions completed</Text>
          </View>
        </View>

        {(review.totalSessionsPartial > 0 || review.totalSessionsBlocked > 0) && (
          <Text style={styles.secondaryLine}>
            {review.totalSessionsPartial} partly completed · {review.totalSessionsBlocked} blocked
          </Text>
        )}

        <Text style={styles.sectionTitle}>By day</Text>
        {review.days.map((d) => (
          <View key={d.date} style={styles.dayRow}>
            <Text style={styles.dayDate}>{d.date}</Text>
            <Text style={styles.dayStat}>
              {d.plannedMinutes} min planned · {d.actualMinutes} min actual · {d.sessionsCompleted} completed
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  hint: { ...typography.caption, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  summaryValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.primary },
  summaryLabel: { ...typography.micro, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  secondaryLine: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  dayRow: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  dayDate: { ...typography.caption, fontWeight: '700', color: colors.text },
  dayStat: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
