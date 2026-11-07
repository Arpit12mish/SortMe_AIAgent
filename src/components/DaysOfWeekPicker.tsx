import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from './theme';
import { PressableScale } from './ui';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function DaysOfWeekPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  const toggle = (day: number) => {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  };

  return (
    <View style={styles.row}>
      {DAY_LABELS.map((label, day) => {
        const selected = value.includes(day);
        return (
          <PressableScale
            key={day}
            onPress={() => toggle(day)}
            scaleTo={0.88}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.primaryText },
});
