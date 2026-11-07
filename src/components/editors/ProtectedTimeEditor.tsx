import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ProtectedTimeBlock } from '../../planning/types';
import { generateId } from '../../utils/id';
import { GhostButton, PrimaryButton, SecondaryButton } from '../Buttons';
import { DaysOfWeekPicker } from '../DaysOfWeekPicker';
import { TimeField, isValidTime } from '../TimeField';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { PressableScale } from '../ui';

const EMPTY_DRAFT = { title: '', start: '', end: '', days: [1, 2, 3, 4, 5] };

export function ProtectedTimeEditor({
  value,
  onChange,
}: {
  value: ProtectedTimeBlock[];
  onChange: (next: ProtectedTimeBlock[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(EMPTY_DRAFT.title);
  const [start, setStart] = useState(EMPTY_DRAFT.start);
  const [end, setEnd] = useState(EMPTY_DRAFT.end);
  const [days, setDays] = useState<number[]>(EMPTY_DRAFT.days);

  const resetDraft = () => {
    setEditingId(null);
    setTitle(EMPTY_DRAFT.title);
    setStart(EMPTY_DRAFT.start);
    setEnd(EMPTY_DRAFT.end);
    setDays(EMPTY_DRAFT.days);
  };

  const startEditing = (p: ProtectedTimeBlock) => {
    setEditingId(p.id);
    setTitle(p.title);
    setStart(p.start);
    setEnd(p.end);
    setDays(p.daysOfWeek);
  };

  const canSave = title.trim().length > 0 && isValidTime(start) && isValidTime(end) && start < end && days.length > 0;

  const save = () => {
    if (!canSave) return;
    const block: ProtectedTimeBlock = { id: editingId ?? generateId('protected'), title: title.trim(), start, end, daysOfWeek: days };
    onChange(editingId ? value.map((p) => (p.id === editingId ? block : p)) : [...value, block]);
    resetDraft();
  };

  const remove = (id: string) => {
    onChange(value.filter((p) => p.id !== id));
    if (editingId === id) resetDraft();
  };

  return (
    <View>
      {value.map((p) => (
        <PressableScale key={p.id} style={styles.card} onPress={() => startEditing(p)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{p.title}</Text>
            <Text style={styles.cardSubtitle}>
              {p.start}–{p.end} · {p.daysOfWeek.length === 7 ? 'Every day' : `${p.daysOfWeek.length} days/week`}
            </Text>
          </View>
          <GhostButton label="Remove" onPress={() => remove(p.id)} tone="danger" />
        </PressableScale>
      ))}
      <View style={styles.addForm}>
        <Text style={styles.formHeader}>{editingId ? 'Edit protected time' : 'New protected time'}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title (e.g. Gym)"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />
        <View style={styles.rowGap}>
          <TimeField label="Start" value={start} onChange={setStart} />
          <TimeField label="End" value={end} onChange={setEnd} />
        </View>
        {start.length > 0 && end.length > 0 && isValidTime(start) && isValidTime(end) && start >= end && (
          <Text style={styles.errorText}>End time must be after start time.</Text>
        )}
        <Text style={styles.helper}>Days</Text>
        <DaysOfWeekPicker value={days} onChange={setDays} />
        <View style={styles.formActions}>
          <PrimaryButton label={editingId ? 'Save changes' : 'Add protected time'} onPress={save} disabled={!canSave} />
          {editingId && <SecondaryButton label="Cancel" onPress={resetDraft} />}
        </View>
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
    ...shadows.card,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
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
  formHeader: { ...typography.label, color: colors.textFaint },
  rowGap: { flexDirection: 'row', gap: spacing.md },
  helper: { ...typography.caption, color: colors.textMuted },
  errorText: { ...typography.caption, fontSize: 12, color: colors.danger },
  formActions: { flexDirection: 'row', gap: spacing.sm },
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
