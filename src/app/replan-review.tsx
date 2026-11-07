import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton, PrimaryButton, SecondaryButton } from '../components/Buttons';
import { PlanBlockRow } from '../components/PlanBlockRow';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { formatDateLabel } from '../planning/time';
import type { PlanChange } from '../planning/types';
import { StalePlanError, useAppState } from '../state/AppStateContext';

const CHANGE_LABEL: Record<PlanChange['type'], string> = {
  added: 'Added',
  moved: 'Moved',
  shortened: 'Shortened',
  deferred: 'Deferred',
};

const CHANGE_COLOR: Record<PlanChange['type'], string> = {
  added: colors.success,
  moved: colors.warning,
  shortened: colors.warning,
  deferred: colors.danger,
};

function ChangeRow({ change }: { change: PlanChange }) {
  return (
    <View style={styles.changeRow}>
      <Text style={[styles.changeType, { color: CHANGE_COLOR[change.type] }]}>{CHANGE_LABEL[change.type]}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.changeTitle}>{change.title}</Text>
        <Text style={styles.changeReason}>{change.reason}</Text>
      </View>
    </View>
  );
}

export default function ReplanReviewScreen() {
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const { activeDate, tasks, planForDate, acceptProposedPlan, editProposedPlan, discardProposedPlan } = useAppState();
  const date = dateParam ?? activeDate;
  const { proposed: proposedPlan } = planForDate(date);
  const [editing, setEditing] = useState(false);
  const [forceInclude, setForceInclude] = useState<Set<string>>(new Set());
  const [forceExclude, setForceExclude] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const eligibleTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'completed' && t.status !== 'delegated'),
    [tasks]
  );

  if (!proposedPlan) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nothing to review right now.</Text>
          <SecondaryButton label="Close" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const isScheduledToday = (taskId: string) => proposedPlan.blocks.some((b) => b.taskId === taskId);

  const toggleTask = async (taskId: string) => {
    const scheduled = isScheduledToday(taskId);
    const nextInclude = new Set(forceInclude);
    const nextExclude = new Set(forceExclude);
    if (scheduled) {
      nextInclude.delete(taskId);
      if (nextExclude.has(taskId)) nextExclude.delete(taskId);
      else nextExclude.add(taskId);
    } else {
      nextExclude.delete(taskId);
      if (nextInclude.has(taskId)) nextInclude.delete(taskId);
      else nextInclude.add(taskId);
    }
    setForceInclude(nextInclude);
    setForceExclude(nextExclude);
    setWorking(true);
    try {
      await editProposedPlan(date, {
        forceIncludeTaskIds: [...nextInclude],
        forceExcludeTaskIds: [...nextExclude],
      });
    } finally {
      setWorking(false);
    }
  };

  const handleStale = () => {
    Alert.alert('Plan changed', 'A newer version of this plan is now available. Please review it instead.');
    router.back();
  };

  const handleAccept = async () => {
    setWorking(true);
    try {
      await acceptProposedPlan(date, proposedPlan.id);
      router.back();
    } catch (e) {
      if (e instanceof StalePlanError) handleStale();
      else throw e;
    } finally {
      setWorking(false);
    }
  };

  const handleDiscard = async () => {
    setWorking(true);
    try {
      await discardProposedPlan(date, proposedPlan.id);
      router.back();
    } catch (e) {
      if (e instanceof StalePlanError) handleStale();
      else throw e;
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>
          Plan v{proposedPlan.version} — proposed{date !== activeDate ? ` for ${formatDateLabel(date)}` : ''}
        </Text>

        {proposedPlan.explanations.map((e, i) => (
          <Text key={i} style={styles.explanation}>
            {e}
          </Text>
        ))}

        {proposedPlan.changes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What changed</Text>
            {proposedPlan.changes.map((c, i) => (
              <ChangeRow key={i} change={c} />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full day</Text>
          {proposedPlan.blocks.map((block) => (
            <PlanBlockRow key={block.id} block={block} />
          ))}
        </View>

        {proposedPlan.unscheduledTasks.length > 0 && (
          <View style={[styles.section, styles.flagSection]}>
            <Text style={styles.flagTitle}>Unscheduled</Text>
            {proposedPlan.unscheduledTasks.map((t) => (
              <Text key={t.taskId} style={styles.flagRow}>
                • {t.title} — {t.reason}
              </Text>
            ))}
          </View>
        )}

        {proposedPlan.atRiskTasks.length > 0 && (
          <View style={[styles.section, styles.riskSection]}>
            <Text style={[styles.flagTitle, { color: colors.danger }]}>At risk</Text>
            {proposedPlan.atRiskTasks.map((t) => (
              <Text key={t.taskId} style={styles.flagRow}>
                • {t.title} — {t.reason}
              </Text>
            ))}
          </View>
        )}

        {editing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adjust what&apos;s included</Text>
            <Text style={styles.explanation}>
              Tap a task to move it in or out of this plan. SortMe recomputes the schedule instantly.
            </Text>
            {eligibleTasks.map((t) => {
              const scheduled = isScheduledToday(t.id);
              return (
                <PressableScale key={t.id} onPress={() => toggleTask(t.id)} style={styles.editRow}>
                  <Text style={styles.editRowTitle}>{t.title}</Text>
                  <Text style={[styles.editRowStatus, { color: scheduled ? colors.success : colors.textMuted }]}>
                    {scheduled ? 'Included' : 'Not included'}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <SecondaryButton label={editing ? 'Done editing' : 'Edit'} onPress={() => setEditing((v) => !v)} />
        <DangerButton label="Discard" onPress={handleDiscard} disabled={working} />
        <PrimaryButton label="Accept" onPress={handleAccept} loading={working} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  heading: { ...typography.heading, fontSize: 20, color: colors.text, marginBottom: spacing.sm },
  explanation: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs, lineHeight: 18 },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.textFaint, marginBottom: spacing.sm },
  changeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  changeType: { ...typography.label, width: 72 },
  changeTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  changeReason: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  flagSection: { backgroundColor: colors.tintWarning, borderRadius: radii.md, padding: spacing.md },
  riskSection: { backgroundColor: colors.tintDanger, borderRadius: radii.md, padding: spacing.md },
  flagTitle: { fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  flagRow: { ...typography.caption, color: colors.text, marginBottom: 2 },
  editRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  editRowTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  editRowStatus: { ...typography.label },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundAlt,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textMuted, ...typography.bodyStrong, fontSize: 16 },
});
