import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HabitDayStatus, HabitDefinition } from '../habits/types';
import { HABIT_STATUS_LABEL, HABIT_STATUS_SYMBOL } from './HabitDayCell';
import { colorForHabitStatus, colors, radii, shadows, spacing, typography } from './theme';
import { PressableScale } from './ui';

/**
 * Today-tab habit row, visually modeled on PlanBlockRow's accent-bar layout
 * but sourced entirely from HabitStateContext — no taskId, no block id, no
 * identifier shared with the planner, so nothing here can touch a Task.
 */
export function HabitTodayRow({
  habit,
  status,
  onPress,
}: {
  habit: HabitDefinition;
  status: HabitDayStatus;
  onPress: () => void;
}) {
  const accent = colorForHabitStatus(status);
  return (
    <View style={styles.row}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <Text style={styles.title}>{habit.name}</Text>
        {!!habit.goal && <Text style={styles.reason}>{habit.goal}</Text>}
      </View>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, ${HABIT_STATUS_LABEL[status]}. Tap to update.`}
        style={styles.badge}
      >
        <Text style={[styles.badgeText, { color: accent }]}>
          {HABIT_STATUS_SYMBOL[status] || '–'} {HABIT_STATUS_LABEL[status]}
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    alignItems: 'center',
    ...shadows.card,
  },
  accent: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: spacing.md },
  title: { ...typography.bodyStrong, color: colors.text },
  reason: { marginTop: 2, ...typography.caption, color: colors.textMuted },
  badge: { paddingHorizontal: spacing.md },
  badgeText: { ...typography.label },
});
