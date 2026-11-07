import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { FixedCommitment } from '../../planning/types';
import { generateId } from '../../utils/id';
import { GhostButton, PrimaryButton, SecondaryButton } from '../Buttons';
import { DateField, isValidDate } from '../DateField';
import { DaysOfWeekPicker } from '../DaysOfWeekPicker';
import { TimeField, isValidTime } from '../TimeField';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { PressableScale } from '../ui';

const EMPTY_DRAFT = { title: '', location: '', start: '', end: '', startDate: '', endDate: '', days: [1, 2, 3, 4, 5] };

export function FixedCommitmentsEditor({
  value,
  onChange,
}: {
  value: FixedCommitment[];
  onChange: (next: FixedCommitment[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(EMPTY_DRAFT.title);
  const [location, setLocation] = useState(EMPTY_DRAFT.location);
  const [start, setStart] = useState(EMPTY_DRAFT.start);
  const [end, setEnd] = useState(EMPTY_DRAFT.end);
  const [startDate, setStartDate] = useState(EMPTY_DRAFT.startDate);
  const [endDate, setEndDate] = useState(EMPTY_DRAFT.endDate);
  const [days, setDays] = useState<number[]>(EMPTY_DRAFT.days);

  const resetDraft = () => {
    setEditingId(null);
    setTitle(EMPTY_DRAFT.title);
    setLocation(EMPTY_DRAFT.location);
    setStart(EMPTY_DRAFT.start);
    setEnd(EMPTY_DRAFT.end);
    setStartDate(EMPTY_DRAFT.startDate);
    setEndDate(EMPTY_DRAFT.endDate);
    setDays(EMPTY_DRAFT.days);
  };

  const startEditing = (c: FixedCommitment) => {
    setEditingId(c.id);
    setTitle(c.title);
    setLocation(c.location ?? '');
    setStart(c.start);
    setEnd(c.end);
    setStartDate(c.startDate ?? '');
    setEndDate(c.endDate ?? '');
    setDays(c.daysOfWeek);
  };

  const canSave =
    title.trim().length > 0 &&
    isValidTime(start) &&
    isValidTime(end) &&
    start < end &&
    days.length > 0 &&
    (startDate.length === 0 || isValidDate(startDate)) &&
    (endDate.length === 0 || isValidDate(endDate)) &&
    (startDate.length === 0 || endDate.length === 0 || startDate <= endDate);

  const save = () => {
    if (!canSave) return;
    const commitment: FixedCommitment = {
      id: editingId ?? generateId('fixed'),
      title: title.trim(),
      location: location.trim() || undefined,
      start,
      end,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      daysOfWeek: days,
    };
    onChange(editingId ? value.map((c) => (c.id === editingId ? commitment : c)) : [...value, commitment]);
    resetDraft();
  };

  const remove = (id: string) => {
    onChange(value.filter((c) => c.id !== id));
    if (editingId === id) resetDraft();
  };

  return (
    <View>
      {value.map((c) => (
        <PressableScale key={c.id} style={styles.card} onPress={() => startEditing(c)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardSubtitle}>
              {c.start}–{c.end} · {c.daysOfWeek.length === 7 ? 'Every day' : `${c.daysOfWeek.length} days/week`}
              {c.location ? ` · ${c.location}` : ''}
            </Text>
            {(c.startDate || c.endDate) && (
              <Text style={styles.cardSubtitle}>
                {c.startDate ? `Starts ${c.startDate}` : ''}
                {c.startDate && c.endDate ? ' · ' : ''}
                {c.endDate ? `Ends ${c.endDate}` : ''}
              </Text>
            )}
          </View>
          <GhostButton label="Remove" onPress={() => remove(c.id)} tone="danger" />
        </PressableScale>
      ))}
      <View style={styles.addForm}>
        <Text style={styles.formHeader}>{editingId ? 'Edit commitment' : 'New commitment'}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title (e.g. Internship)"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Location (optional)"
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
        <Text style={styles.helper}>Recurs from / until (optional)</Text>
        <View style={styles.rowGap}>
          <DateField label="Start date" value={startDate} onChange={setStartDate} />
          <DateField label="End date" value={endDate} onChange={setEndDate} />
        </View>
        {startDate.length > 0 && endDate.length > 0 && isValidDate(startDate) && isValidDate(endDate) && startDate > endDate && (
          <Text style={styles.errorText}>End date must be on or after start date.</Text>
        )}
        <View style={styles.formActions}>
          <PrimaryButton label={editingId ? 'Save changes' : 'Add commitment'} onPress={save} disabled={!canSave} />
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
