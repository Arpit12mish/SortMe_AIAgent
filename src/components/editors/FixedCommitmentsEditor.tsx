import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { FixedCommitment } from '../../planning/types';
import { generateId } from '../../utils/id';
import { SecondaryButton } from '../Buttons';
import { DaysOfWeekPicker } from '../DaysOfWeekPicker';
import { TimeField, isValidTime } from '../TimeField';
import { colors, radii, spacing } from '../theme';

export function FixedCommitmentsEditor({
  value,
  onChange,
}: {
  value: FixedCommitment[];
  onChange: (next: FixedCommitment[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const canAdd = title.trim().length > 0 && isValidTime(start) && isValidTime(end) && days.length > 0;

  const add = () => {
    if (!canAdd) return;
    onChange([...value, { id: generateId('fixed'), title: title.trim(), start, end, daysOfWeek: days }]);
    setTitle('');
    setStart('');
    setEnd('');
    setDays([1, 2, 3, 4, 5]);
  };

  const remove = (id: string) => onChange(value.filter((c) => c.id !== id));

  return (
    <View>
      {value.map((c) => (
        <View key={c.id} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardSubtitle}>
              {c.start}–{c.end} · {c.daysOfWeek.length === 7 ? 'Every day' : `${c.daysOfWeek.length} days/week`}
            </Text>
          </View>
          <Pressable onPress={() => remove(c.id)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.addForm}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title (e.g. Algorithms lecture)"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />
        <View style={styles.rowGap}>
          <TimeField label="Start" value={start} onChange={setStart} />
          <TimeField label="End" value={end} onChange={setEnd} />
        </View>
        <Text style={styles.helper}>Days</Text>
        <DaysOfWeekPicker value={days} onChange={setDays} />
        <SecondaryButton label="Add commitment" onPress={add} disabled={!canAdd} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  addForm: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rowGap: { flexDirection: 'row', gap: spacing.md },
  helper: { fontSize: 13, color: colors.textMuted },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
});
