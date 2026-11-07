import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, colorForPriority, radii, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { TimeField, isValidTime } from '../components/TimeField';
import { dateAndTimeToISO, formatTimeOfDay } from '../planning/time';
import type { TaskPriority } from '../planning/types';
import { useAppState } from '../state/AppStateContext';
import { useProjectState } from '../state/ProjectStateContext';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const DUE_OFFSETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

export default function TaskNewScreen() {
  const router = useRouter();
  const { urgent, id, projectId, milestoneId, title: prefillTitle, dueOffsetDays: prefillDueOffsetDays } =
    useLocalSearchParams<{
      urgent?: string;
      id?: string;
      projectId?: string;
      milestoneId?: string;
      /** Voice capture prefill — see src/app/capture.tsx. Ignored once editing an existing task. */
      title?: string;
      dueOffsetDays?: string;
    }>();
  const isUrgentPreset = urgent === '1';
  const hasPrefillDeadline = prefillDueOffsetDays !== undefined && !Number.isNaN(Number(prefillDueOffsetDays));
  const { tasks, addTask, updateTask, activeDate } = useAppState();
  const { projects } = useProjectState();
  const existing = useMemo(() => tasks.find((t) => t.id === id), [tasks, id]);
  const isEditing = !!existing;
  // Linking only ever happens at creation, via these params — editing an already-linked
  // task through this same form never touches its projectId/milestoneId (see handleSubmit).
  const linkingProject = !isEditing && projectId ? projects.find((p) => p.id === projectId) : undefined;

  // The deadline chips only offer 4 canned offsets; an edit preloads whichever offset the
  // existing deadline actually is (even if it doesn't land on one of the 4), so leaving the
  // date untouched during an edit doesn't silently move it — same limitation the create flow
  // already has, since only those 4 offsets are reachable through the chip UI either way.
  const existingOffsetDays = useMemo(() => {
    if (!existing?.deadline) return null;
    const deadlineDate = new Date(existing.deadline);
    const startOfActiveDate = new Date(`${activeDate}T00:00:00`);
    return Math.round((deadlineDate.getTime() - startOfActiveDate.getTime()) / (24 * 60 * 60 * 1000));
  }, [existing, activeDate]);

  const [title, setTitle] = useState(existing?.title ?? prefillTitle ?? '');
  const [estimateMinutes, setEstimateMinutes] = useState(String(existing?.estimateMinutes ?? 60));
  const [priority, setPriority] = useState<TaskPriority>(existing?.priority ?? (isUrgentPreset ? 'urgent' : 'medium'));
  const [canMove, setCanMove] = useState(existing?.canMove ?? true);
  const [hasDeadline, setHasDeadline] = useState(existing ? !!existing.deadline : isUrgentPreset || hasPrefillDeadline);
  const [dueOffsetDays, setDueOffsetDays] = useState(
    existingOffsetDays ?? (hasPrefillDeadline ? Number(prefillDueOffsetDays) : isUrgentPreset ? 1 : 0)
  );
  const [dueTime, setDueTime] = useState(
    existing?.deadline ? formatTimeOfDay(existing.deadline) : isUrgentPreset ? '09:00' : '18:00'
  );
  const [replanToday, setReplanToday] = useState(isUrgentPreset);
  const [submitting, setSubmitting] = useState(false);

  const estimate = parseInt(estimateMinutes, 10);
  const canSubmit =
    title.trim().length > 0 &&
    Number.isFinite(estimate) &&
    estimate > 0 &&
    (!hasDeadline || isValidTime(dueTime));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const deadline = hasDeadline ? dateAndTimeToISO(activeDate, dueTime, dueOffsetDays) : undefined;
      if (existing) {
        await updateTask(
          existing.id,
          { title: title.trim(), estimateMinutes: estimate, deadline, priority, canMove },
          { triggerReplan: replanToday }
        );
      } else {
        await addTask(
          { title: title.trim(), estimateMinutes: estimate, deadline, priority, canMove, projectId, milestoneId },
          { triggerReplan: replanToday }
        );
      }
      if (replanToday) {
        // The edited/added task may be scheduled on a future accepted date, not necessarily
        // today — route through the week view so whichever date actually got a proposal is
        // visible, rather than assuming it was today.
        router.replace('/week');
      } else {
        router.back();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {isUrgentPreset && (
          <Text style={styles.presetNote}>
            Urgent task: priority and same-day replan are pre-selected. Adjust anything below.
          </Text>
        )}
        {linkingProject && (
          <Text style={styles.presetNote}>Linking to project: {linkingProject.title}</Text>
        )}

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Internship assignment"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />

        <Text style={styles.label}>Estimated duration (minutes)</Text>
        <TextInput
          value={estimateMinutes}
          onChangeText={setEstimateMinutes}
          keyboardType="number-pad"
          style={styles.textInput}
        />

        <Text style={styles.label}>Priority</Text>
        <View style={styles.chipRow}>
          {PRIORITIES.map((p) => (
            <PressableScale
              key={p}
              onPress={() => setPriority(p)}
              scaleTo={0.93}
              style={[
                styles.chip,
                priority === p && { backgroundColor: colorForPriority(p), borderColor: colorForPriority(p) },
              ]}
            >
              <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>{p}</Text>
            </PressableScale>
          ))}
        </View>

        <Text style={styles.label}>Can this task move if something urgent comes up?</Text>
        <SecondaryButton label={canMove ? 'Yes — movable' : 'No — keep it fixed once scheduled'} onPress={() => setCanMove((v) => !v)} />

        <Text style={styles.label}>Deadline</Text>
        <SecondaryButton label={hasDeadline ? 'Has a deadline' : 'No deadline'} onPress={() => setHasDeadline((v) => !v)} />
        {hasDeadline && (
          <View style={styles.deadlineBlock}>
            <View style={styles.chipRow}>
              {DUE_OFFSETS.map((o) => (
                <PressableScale
                  key={o.days}
                  onPress={() => setDueOffsetDays(o.days)}
                  scaleTo={0.93}
                  style={[styles.chip, dueOffsetDays === o.days && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, dueOffsetDays === o.days && styles.chipTextSelected]}>
                    {o.label}
                  </Text>
                </PressableScale>
              ))}
            </View>
            <TimeField label="Due time" value={dueTime} onChange={setDueTime} />
          </View>
        )}

        <View style={styles.replanRow}>
          <Text style={styles.label}>
            {isEditing ? 'Review this change against its scheduled date?' : "Replan today's schedule now?"}
          </Text>
          <SecondaryButton
            label={replanToday ? 'Yes, review now' : 'No, just save'}
            onPress={() => setReplanToday((v) => !v)}
          />
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label={isEditing ? 'Save changes' : 'Save task'}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  presetNote: {
    backgroundColor: colors.tintPrimary,
    color: colors.text,
    ...typography.caption,
    fontWeight: '600',
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  label: { ...typography.caption, fontWeight: '600', color: colors.textMuted, marginTop: spacing.md },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.primaryText },
  deadlineBlock: { gap: spacing.sm },
  replanRow: { marginTop: spacing.md, gap: spacing.sm },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xl },
});
