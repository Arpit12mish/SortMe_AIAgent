import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TimeRange } from '../../planning/types';
import { SecondaryButton } from '../Buttons';
import { TimeField, isValidTime } from '../TimeField';
import { colors, radii, spacing } from '../theme';

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
          <Pressable onPress={() => remove(i)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
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
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  addForm: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rowGap: { flexDirection: 'row', gap: spacing.md },
});
