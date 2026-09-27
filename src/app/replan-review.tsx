import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton, PrimaryButton, SecondaryButton } from '../components/Buttons';
import { PlanBlockRow } from '../components/PlanBlockRow';
import { colors, radii, spacing } from '../components/theme';
import type { PlanChange } from '../planning/types';
import { useAppState } from '../state/AppStateContext';

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
  const { proposedPlan, tasks, acceptProposedPlan, editProposedPlan, discardProposedPlan } = useAppState();
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
      await editProposedPlan({
        forceIncludeTaskIds: [...nextInclude],
        forceExcludeTaskIds: [...nextExclude],
      });
    } finally {
      setWorking(false);
    }
  };

  const handleAccept = async () => {
    setWorking(true);
    try {
      await acceptProposedPlan();
      router.back();
    } finally {
      setWorking(false);
    }
  };

  const handleDiscard = async () => {
    setWorking(true);
    try {
      await discardProposedPlan();
      router.back();
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Plan v{proposedPlan.version} — proposed</Text>

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
            <Text style={styles.sectionTitle}>Adjust what&apos;s included today</Text>
            <Text style={styles.explanation}>
              Tap a task to move it in or out of today&apos;s plan. SortMe recomputes the schedule instantly.
            </Text>
            {eligibleTasks.map((t) => {
              const scheduled = isScheduledToday(t.id);
              return (
                <Pressable key={t.id} onPress={() => toggleTask(t.id)} style={styles.editRow}>
                  <Text style={styles.editRowTitle}>{t.title}</Text>
                  <Text style={[styles.editRowStatus, { color: scheduled ? colors.success : colors.textMuted }]}>
                    {scheduled ? 'In today' : 'Not today'}
                  </Text>
                </Pressable>
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
  heading: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  explanation: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs, lineHeight: 18 },
  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase' },
  changeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  changeType: { fontSize: 12, fontWeight: '700', width: 72 },
  changeTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  changeReason: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  flagSection: { backgroundColor: '#FFF7E6', borderRadius: radii.md, padding: spacing.md },
  riskSection: { backgroundColor: '#FDECEC', borderRadius: radii.md, padding: spacing.md },
  flagTitle: { fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  flagRow: { fontSize: 13, color: colors.text, marginBottom: 2 },
  editRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  editRowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  editRowStatus: { fontSize: 12, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 16 },
});
