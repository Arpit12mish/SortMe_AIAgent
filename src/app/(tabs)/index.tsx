import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { PlanBlockRow } from '../../components/PlanBlockRow';
import { colors, radii, spacing } from '../../components/theme';
import { useAppState } from '../../state/AppStateContext';

export default function TodayScreen() {
  const router = useRouter();
  const { currentPlan, proposedPlan, generateInitialPlan, reportDelay, loading } = useAppState();
  const [showDelayOptions, setShowDelayOptions] = useState(false);
  const [working, setWorking] = useState(false);

  const handleGenerate = async () => {
    setWorking(true);
    try {
      await generateInitialPlan();
      router.push('/replan-review');
    } finally {
      setWorking(false);
    }
  };

  const handleDelay = async (minutes: number) => {
    setShowDelayOptions(false);
    setWorking(true);
    try {
      await reportDelay(undefined, minutes);
      router.push('/replan-review');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Today</Text>

        {proposedPlan && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>You have a revised plan waiting for review.</Text>
            <SecondaryButton label="Review now" onPress={() => router.push('/replan-review')} />
          </View>
        )}

        {!currentPlan && !proposedPlan && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No plan yet for today</Text>
            <Text style={styles.emptyBody}>
              Generate a plan from your fixed commitments, meals, and tasks.
            </Text>
            <PrimaryButton label="Generate today's plan" onPress={handleGenerate} loading={working} />
          </View>
        )}

        {currentPlan && (
          <>
            <Text style={styles.sectionLabel}>Plan v{currentPlan.version} · Accepted</Text>
            {currentPlan.blocks.map((block) => (
              <PlanBlockRow key={block.id} block={block} />
            ))}

            {currentPlan.unscheduledTasks.length > 0 && (
              <View style={styles.flagSection}>
                <Text style={styles.flagTitle}>Unscheduled</Text>
                {currentPlan.unscheduledTasks.map((t) => (
                  <Text key={t.taskId} style={styles.flagRow}>
                    • {t.title} — {t.reason}
                  </Text>
                ))}
              </View>
            )}

            {currentPlan.atRiskTasks.length > 0 && (
              <View style={[styles.flagSection, styles.riskSection]}>
                <Text style={[styles.flagTitle, { color: colors.danger }]}>At risk</Text>
                {currentPlan.atRiskTasks.map((t) => (
                  <Text key={t.taskId} style={styles.flagRow}>
                    • {t.title} — {t.reason}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.actions}>
              <PrimaryButton
                label="Add urgent task"
                onPress={() => router.push({ pathname: '/task-new', params: { urgent: '1' } })}
              />
              {showDelayOptions ? (
                <View style={styles.delayRow}>
                  {[15, 30, 45, 60].map((m) => (
                    <SecondaryButton key={m} label={`${m}m`} onPress={() => handleDelay(m)} />
                  ))}
                </View>
              ) : (
                <SecondaryButton label="Report a delay" onPress={() => setShowDelayOptions(true)} />
              )}
              <SecondaryButton label="View plan history" onPress={() => router.push('/history')} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  banner: {
    backgroundColor: '#EFF2FF',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bannerText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  flagSection: {
    backgroundColor: '#FFF7E6',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  riskSection: { backgroundColor: '#FDECEC' },
  flagTitle: { fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  flagRow: { fontSize: 13, color: colors.text, marginBottom: 2 },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  delayRow: { flexDirection: 'row', gap: spacing.sm },
});
