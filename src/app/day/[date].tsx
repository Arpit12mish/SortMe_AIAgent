import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { PlanBlockRow } from '../../components/PlanBlockRow';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { formatDateLabel } from '../../planning/time';
import { useAppState } from '../../state/AppStateContext';

export default function DayDetailScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { activeDate, planForDate, generatePlanForDate } = useAppState();
  const [working, setWorking] = useState(false);
  const { current, proposed } = planForDate(date);

  const handleGenerate = async () => {
    setWorking(true);
    try {
      await generatePlanForDate(date);
      router.push(`/replan-review?date=${date}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {formatDateLabel(date)}
          {date === activeDate ? ' · Today' : ''}
        </Text>

        {proposed && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>This date has changes waiting for review.</Text>
            <SecondaryButton label="Review now" onPress={() => router.push(`/replan-review?date=${date}`)} />
          </View>
        )}

        {!current && !proposed && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No plan yet for this date</Text>
            <Text style={styles.emptyBody}>
              Generate a plan from your fixed commitments, meals, and tasks — as they apply on this date.
            </Text>
            <PrimaryButton label="Generate plan for this date" onPress={handleGenerate} loading={working} />
          </View>
        )}

        {current && (
          <>
            <Text style={styles.sectionLabel}>Plan v{current.version} · Accepted</Text>
            <View style={styles.hourlyLinkRow}>
              <SecondaryButton label="View hourly plan" onPress={() => router.push(`/hourly/${date}`)} />
            </View>
            {current.blocks.map((block) => (
              <PlanBlockRow key={block.id} block={block} />
            ))}

            {current.unscheduledTasks.length > 0 && (
              <View style={styles.flagSection}>
                <Text style={styles.flagTitle}>Unscheduled</Text>
                {current.unscheduledTasks.map((t) => (
                  <Text key={t.taskId} style={styles.flagRow}>
                    • {t.title} — {t.reason}
                  </Text>
                ))}
              </View>
            )}

            {current.atRiskTasks.length > 0 && (
              <View style={[styles.flagSection, styles.riskSection]}>
                <Text style={[styles.flagTitle, { color: colors.danger }]}>At risk</Text>
                {current.atRiskTasks.map((t) => (
                  <Text key={t.taskId} style={styles.flagRow}>
                    • {t.title} — {t.reason}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.md },
  sectionLabel: { ...typography.label, color: colors.textFaint, marginBottom: spacing.sm },
  hourlyLinkRow: { marginBottom: spacing.md },
  banner: {
    backgroundColor: colors.tintPrimary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bannerText: { color: colors.text, ...typography.bodyStrong, fontSize: 14 },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  flagSection: {
    backgroundColor: colors.tintWarning,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  riskSection: { backgroundColor: colors.tintDanger },
  flagTitle: { fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  flagRow: { ...typography.caption, color: colors.text, marginBottom: 2 },
});
