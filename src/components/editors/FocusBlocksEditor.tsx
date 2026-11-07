import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TimeRange } from '../../planning/types';
import { GhostButton, SecondaryButton } from '../Buttons';
import { TimeField, isValidTime } from '../TimeField';
import { colors, radii, shadows, spacing, typography } from '../theme';

export function FocusBlocksEditor({
  value,
  onChange,
}: {
  value: TimeRange[];
  onChange: (next: TimeRange[]) => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const canAdd = isValidTime(start) && isValidTime(end);

  const add = () => {
    if (!canAdd) return;
    onChange([...value, { start, end }]);
    setStart('');
    setEnd('');
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <View>
      {value.map((f, i) => (
        <View key={`${f.start}-${f.end}-${i}`} style={styles.card}>
          <Text style={styles.cardTitle}>
            {f.start} – {f.end}
          </Text>
          <GhostButton label="Remove" onPress={() => remove(i)} tone="danger" />
        </View>
      ))}
      <View style={styles.addForm}>
        <View style={styles.rowGap}>
          <TimeField label="Start" value={start} onChange={setStart} />
          <TimeField label="End" value={end} onChange={setEnd} />
        </View>
        <SecondaryButton label="Add focus window" onPress={add} disabled={!canAdd} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  remove: { color: colors.danger, ...typography.caption, fontWeight: '600' },
  addForm: {
    backgroundColor: colors.cardElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rowGap: { flexDirection: 'row', gap: spacing.md },
});
