import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, colorForPriority, radii, spacing } from '../components/theme';
import { TimeField, isValidTime } from '../components/TimeField';
import { dateAndTimeToISO } from '../planning/time';
import type { TaskPriority } from '../planning/types';
import { useAppState } from '../state/AppStateContext';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const DUE_OFFSETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

export default function TaskNewScreen() {
  const router = useRouter();
  const { urgent } = useLocalSearchParams<{ urgent?: string }>();
  const isUrgentPreset = urgent === '1';
  const { addTask, activeDate } = useAppState();

  const [title, setTitle] = useState('');
  const [estimateMinutes, setEstimateMinutes] = useState('60');
  const [priority, setPriority] = useState<TaskPriority>(isUrgentPreset ? 'urgent' : 'medium');
  const [canMove, setCanMove] = useState(true);
  const [hasDeadline, setHasDeadline] = useState(isUrgentPreset);
  const [dueOffsetDays, setDueOffsetDays] = useState(isUrgentPreset ? 1 : 0);
  const [dueTime, setDueTime] = useState(isUrgentPreset ? '09:00' : '18:00');
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
      await addTask(
        { title: title.trim(), estimateMinutes: estimate, deadline, priority, canMove },
        { triggerReplan: replanToday }
      );
      if (replanToday) {
        router.replace('/replan-review');
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
            <Pressable
              key={p}
              onPress={() => setPriority(p)}
              style={[
                styles.chip,
                priority === p && { backgroundColor: colorForPriority(p), borderColor: colorForPriority(p) },
              ]}
            >
              <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>{p}</Text>
            </Pressable>
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
                <Pressable
                  key={o.days}
                  onPress={() => setDueOffsetDays(o.days)}
                  style={[styles.chip, dueOffsetDays === o.days && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, dueOffsetDays === o.days && styles.chipTextSelected]}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TimeField label="Due time" value={dueTime} onChange={setDueTime} />
          </View>
        )}

        <View style={styles.replanRow}>
          <Text style={styles.label}>Replan today&apos;s schedule now?</Text>
          <SecondaryButton
            label={replanToday ? 'Yes, replan now' : 'No, just add to backlog'}
            onPress={() => setReplanToday((v) => !v)}
          />
        </View>

        <View style={styles.footer}>
          <PrimaryButton label="Save task" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  presetNote: {
    backgroundColor: '#FDECEC',
    color: colors.text,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: spacing.md },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.primaryText },
  deadlineBlock: { gap: spacing.sm },
  replanRow: { marginTop: spacing.md, gap: spacing.sm },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xl },
});
