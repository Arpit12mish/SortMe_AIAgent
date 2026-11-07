import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Goal } from '../../planning/types';
import { generateId } from '../../utils/id';
import { GhostButton, SecondaryButton } from '../Buttons';
import { colors, radii, shadows, spacing, typography } from '../theme';

export function GoalsEditor({ value, onChange }: { value: Goal[]; onChange: (next: Goal[]) => void }) {
  const [title, setTitle] = useState('');

  const add = () => {
    if (!title.trim()) return;
    onChange([...value, { id: generateId('goal'), title: title.trim() }]);
    setTitle('');
  };

  const remove = (id: string) => onChange(value.filter((g) => g.id !== id));

  return (
    <View>
      {value.map((g) => (
        <View key={g.id} style={styles.card}>
          <Text style={styles.cardTitle}>{g.title}</Text>
          <GhostButton label="Remove" onPress={() => remove(g.id)} tone="danger" />
        </View>
      ))}
      <View style={styles.addForm}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Land a software internship"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />
        <SecondaryButton label="Add goal" onPress={add} disabled={!title.trim()} />
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
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
});
