import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayLocalDate } from '../checkins/checkinEngine';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { DaysOfWeekPicker } from '../components/DaysOfWeekPicker';
import { colors, radii, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { isValidTime, TimeField } from '../components/TimeField';
import { toISODate } from '../planning/time';
import { useHabitState } from '../state/HabitStateContext';

const START_OFFSETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

function offsetDate(today: string, days: number): string {
  const [year, month, day] = today.split('-').map(Number);
  return toISODate(new Date(year, (month ?? 1) - 1, day + days));
}

export default function HabitNewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { habits, addHabit, updateHabit } = useHabitState();
  const existing = useMemo(() => habits.find((h) => h.id === id), [habits, id]);
  const isEditing = !!existing;
  const today = useMemo(() => todayLocalDate(), []);

  const [name, setName] = useState(existing?.name ?? '');
  const [goal, setGoal] = useState(existing?.goal ?? '');
  const [scheduledDays, setScheduledDays] = useState<number[]>(existing?.scheduledDays ?? [1, 2, 3, 4, 5]);
  const [startOffsetDays, setStartOffsetDays] = useState(0);
  const [hasReminder, setHasReminder] = useState(!!existing?.reminderTime);
  const [reminderTime, setReminderTime] = useState(existing?.reminderTime ?? '09:00');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && scheduledDays.length > 0 && (!hasReminder || isValidTime(reminderTime));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const input = {
        name: name.trim(),
        goal: goal.trim() || undefined,
        scheduledDays,
        startDate: existing?.startDate ?? offsetDate(today, startOffsetDays),
        reminderTime: hasReminder ? reminderTime : undefined,
      };
      if (existing) {
        await updateHabit(existing.id, input);
      } else {
        await addHabit(input);
      }
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Drink water"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />

        <Text style={styles.label}>Goal or target (optional)</Text>
        <TextInput
          value={goal}
          onChangeText={setGoal}
          placeholder="e.g. 8 glasses"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />

        <Text style={styles.label}>Days</Text>
        <DaysOfWeekPicker value={scheduledDays} onChange={setScheduledDays} />

        <Text style={styles.label}>Start date</Text>
        {isEditing ? (
          <Text style={styles.readOnlyValue}>Started {existing?.startDate}</Text>
        ) : (
          <View style={styles.chipRow}>
            {START_OFFSETS.map((o) => (
              <PressableScale
                key={o.days}
                onPress={() => setStartOffsetDays(o.days)}
                scaleTo={0.93}
                style={[styles.chip, startOffsetDays === o.days && styles.chipSelected]}
              >
                <Text style={[styles.chipText, startOffsetDays === o.days && styles.chipTextSelected]}>{o.label}</Text>
              </PressableScale>
            ))}
          </View>
        )}

        <Text style={styles.label}>Reminder</Text>
        <SecondaryButton label={hasReminder ? 'Has a reminder' : 'No reminder'} onPress={() => setHasReminder((v) => !v)} />
        {hasReminder && (
          <View style={styles.reminderBlock}>
            <TimeField label="Reminder time" value={reminderTime} onChange={setReminderTime} />
          </View>
        )}

        <View style={styles.footer}>
          <PrimaryButton
            label={isEditing ? 'Save changes' : 'Create habit'}
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
  readOnlyValue: { ...typography.body, color: colors.text, paddingVertical: spacing.xs },
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
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.primaryText },
  reminderBlock: { marginTop: spacing.sm },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xl },
});
