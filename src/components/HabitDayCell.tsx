import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HabitDayStatus } from '../habits/types';
import type { ISODate } from '../planning/types';
import { colorForHabitStatus, colors, radii } from './theme';

const HABIT_STATUS_LABEL: Record<HabitDayStatus, string> = {
  completed: 'Completed',
  partial: 'Partly completed',
  missed: 'Missed',
  untracked: 'Untracked',
};

const HABIT_STATUS_SYMBOL: Record<HabitDayStatus, string> = {
  completed: '✓',
  partial: '~',
  missed: '✕',
  untracked: '',
};

export { HABIT_STATUS_LABEL, HABIT_STATUS_SYMBOL };

/**
 * Renders a day's status as color AND a visible symbol/label — never color
 * alone. `scheduled` is separate from `status` because deriveHabitDayStatus
 * resolves both a rest day and a scheduled-but-pending day to 'untracked';
 * this cell tells them apart with distinct copy ("Not scheduled" vs
 * "Untracked") so a screen-reader user isn't told a rest day looks like a
 * missed opportunity.
 */
export function HabitDayCell({
  date,
  status,
  scheduled,
  interactive,
  onPress,
  showDayNumber = true,
  dimmed = false,
  size = 32,
}: {
  date: ISODate;
  status: HabitDayStatus;
  scheduled: boolean;
  interactive: boolean;
  onPress?: () => void;
  showDayNumber?: boolean;
  dimmed?: boolean;
  size?: number;
}) {
  const dayNumber = Number(date.split('-')[2]);
  const background = scheduled ? colorForHabitStatus(status) : colors.background;
  const symbol = scheduled ? HABIT_STATUS_SYMBOL[status] : '';
  const statusLabel = scheduled ? HABIT_STATUS_LABEL[status] : 'Not scheduled';
  const accessibilityLabel = `${date}, ${statusLabel}`;

  const content = (
    <View
      style={[
        styles.cell,
        { width: size, height: size, backgroundColor: background, opacity: dimmed ? 0.35 : 1 },
      ]}
    >
      {showDayNumber && <Text style={[styles.dayNumber, scheduled && styles.dayNumberOnColor]}>{dayNumber}</Text>}
      {!!symbol && <Text style={styles.symbol}>{symbol}</Text>}
    </View>
  );

  if (!interactive) {
    return (
      <View accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: true }}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayNumber: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  dayNumberOnColor: { color: colors.primaryText },
  symbol: { fontSize: 10, fontWeight: '700', color: colors.primaryText, marginTop: -2 },
});
