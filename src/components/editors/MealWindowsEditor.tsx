import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MealWindows } from '../../planning/types';
import { TimeField } from '../TimeField';
import { spacing } from '../theme';

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'] as const;

export function MealWindowsEditor({
  value,
  onChange,
}: {
  value: MealWindows;
  onChange: (next: MealWindows) => void;
}) {
  return (
    <View>
      {MEAL_KEYS.map((key) => (
        <View key={key} style={styles.row}>
          <TimeField
            label={`${key[0].toUpperCase()}${key.slice(1)} start`}
            value={value[key].start}
            onChange={(v) => onChange({ ...value, [key]: { ...value[key], start: v } })}
          />
          <TimeField
            label="End"
            value={value[key].end}
            onChange={(v) => onChange({ ...value, [key]: { ...value[key], end: v } })}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
});
