import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Goal } from '../../planning/types';
import { generateId } from '../../utils/id';
import { SecondaryButton } from '../Buttons';
import { colors, radii, spacing } from '../theme';

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
          <Pressable onPress={() => remove(g.id)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
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
