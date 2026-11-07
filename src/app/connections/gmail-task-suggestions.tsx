import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractTasksFromEmails } from '../../ai/api';
import type { ExtractedTaskSuggestion, TaskPrioritySuggestion } from '../../ai/types';
import { PrimaryButton } from '../../components/Buttons';
import { colorForPriority, colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { ApiError } from '../../connections/types';
import { dateAndTimeToISO } from '../../planning/time';
import { useAppState } from '../../state/AppStateContext';

const PRIORITIES: TaskPrioritySuggestion[] = ['low', 'medium', 'high', 'urgent'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Suggestion extends ExtractedTaskSuggestion {
  included: boolean;
  dueDate: string; // editable, YYYY-MM-DD or ''
}

export default function GmailTaskSuggestionsScreen() {
  const router = useRouter();
  const { addTask } = useAppState();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await extractTasksFromEmails();
        if (cancelled) return;
        setSuggestions(
          response.tasks.map((t) => ({ ...t, included: true, dueDate: t.suggestedDueDate ?? '' }))
        );
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof ApiError ? e.message : 'Could not suggest tasks right now.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof Suggestion>(index: number, field: K, value: Suggestion[K]) => {
    setSuggestions((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const datesValid = suggestions.every((s) => !s.included || s.dueDate === '' || DATE_RE.test(s.dueDate));

  const handleSave = async () => {
    if (!datesValid) {
      Alert.alert('Check the dates', 'Use YYYY-MM-DD, e.g. 2026-10-10, or leave blank.');
      return;
    }
    const checked = suggestions.filter((s) => s.included);
    if (checked.length === 0) {
      Alert.alert('Nothing selected', 'Check at least one task to save.');
      return;
    }
    setSaving(true);
    try {
      for (const s of checked) {
        await addTask(
          {
            title: s.title.trim(),
            estimateMinutes: 30,
            deadline: s.dueDate ? dateAndTimeToISO(s.dueDate, '18:00') : undefined,
            priority: s.priority,
            canMove: true,
          },
          { triggerReplan: false }
        );
      }
      router.back();
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving these tasks. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helper}>Reading your emails for actionable tasks…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (suggestions.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.helper}>No actionable tasks found in your recent synced emails.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>Review before adding — nothing is saved until you tap Add below.</Text>

        {suggestions.map((s, index) => (
          <View key={index} style={styles.card}>
            <PressableScale onPress={() => update(index, 'included', !s.included)} style={styles.checkRow} scaleTo={0.98}>
              <View style={[styles.checkbox, s.included && styles.checkboxChecked]}>
                {s.included && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>{s.included ? 'Included' : 'Excluded'}</Text>
            </PressableScale>

            <TextInput value={s.title} onChangeText={(v) => update(index, 'title', v)} style={styles.textInput} />

            <View style={styles.chipRow}>
              {PRIORITIES.map((p) => (
                <PressableScale
                  key={p}
                  onPress={() => update(index, 'priority', p)}
                  scaleTo={0.93}
                  style={[styles.chip, s.priority === p && { backgroundColor: colorForPriority(p), borderColor: colorForPriority(p) }]}
                >
                  <Text style={[styles.chipText, s.priority === p && styles.chipTextSelected]}>{p}</Text>
                </PressableScale>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Due date (optional)</Text>
            <TextInput
              value={s.dueDate}
              onChangeText={(v) => update(index, 'dueDate', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={styles.textInput}
            />

            {s.sourceEmailSubject && <Text style={styles.sourceCaption}>From: {s.sourceEmailSubject}</Text>}
          </View>
        ))}

        <View style={styles.footer}>
          <PrimaryButton
            label={`Add ${suggestions.filter((s) => s.included).length} task(s)`}
            onPress={handleSave}
            loading={saving}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  helper: { ...typography.body, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  checkLabel: { ...typography.caption, color: colors.textMuted },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.primaryText },
  fieldLabel: { ...typography.label, color: colors.textFaint },
  sourceCaption: { ...typography.caption, fontSize: 12, color: colors.textFaint, fontStyle: 'italic' },
  footer: { marginTop: spacing.md },
});
