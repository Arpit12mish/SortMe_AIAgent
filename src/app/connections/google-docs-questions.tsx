import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateStudyQuestions } from '../../ai/api';
import type { GeneratedQuestion } from '../../ai/types';
import { PrimaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { ApiError } from '../../connections/types';
import { usePrepState } from '../../state/PrepStateContext';

interface Suggestion extends GeneratedQuestion {
  included: boolean;
}

export default function GoogleDocsQuestionsScreen() {
  const router = useRouter();
  const { rawDocId, title } = useLocalSearchParams<{ rawDocId: string; title?: string }>();
  const { notes, addNote, updateNote, addQuestion } = usePrepState();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [documentTitle, setDocumentTitle] = useState(title ?? 'Untitled document');
  const [documentContentText, setDocumentContentText] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await generateStudyQuestions(rawDocId, 8);
        if (cancelled) return;
        setDocumentTitle(response.documentTitle ?? title ?? 'Untitled document');
        setDocumentContentText(response.documentContentText);
        setSuggestions(response.questions.map((q) => ({ ...q, included: true })));
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof ApiError ? e.message : 'Could not generate questions right now.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawDocId, title]);

  const toggleIncluded = (index: number) => {
    setSuggestions((prev) => prev.map((s, i) => (i === index ? { ...s, included: !s.included } : s)));
  };

  const updateField = (index: number, field: 'question' | 'answer', value: string) => {
    setSuggestions((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    const checked = suggestions.filter((s) => s.included);
    if (checked.length === 0) {
      Alert.alert('Nothing selected', 'Check at least one question to save.');
      return;
    }
    setSaving(true);
    try {
      const existingNote = notes.find((n) => n.source === 'google_doc' && n.sourceRef === rawDocId);
      let noteId: string;
      if (existingNote) {
        await updateNote(existingNote.id, { body: documentContentText ?? existingNote.body });
        noteId = existingNote.id;
      } else {
        const note = await addNote({
          title: documentTitle,
          topic: documentTitle,
          body: documentContentText ?? '',
          source: 'google_doc',
          sourceRef: rawDocId,
        });
        noteId = note.id;
      }
      await Promise.all(checked.map((s) => addQuestion({ noteId, question: s.question, answer: s.answer })));
      router.replace({ pathname: '/notes/[id]', params: { id: noteId } });
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving these questions. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helper}>Reading {documentTitle} and generating questions…</Text>
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

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>
          Generated from the full text of “{documentTitle}”. Edit anything, uncheck what you don’t want, then save.
        </Text>

        {suggestions.map((s, index) => (
          <View key={index} style={styles.card}>
            <PressableScale onPress={() => toggleIncluded(index)} style={styles.checkRow} scaleTo={0.98}>
              <View style={[styles.checkbox, s.included && styles.checkboxChecked]}>
                {s.included && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>{s.included ? 'Included' : 'Excluded'}</Text>
            </PressableScale>
            <Text style={styles.fieldLabel}>Question</Text>
            <TextInput
              value={s.question}
              onChangeText={(v) => updateField(index, 'question', v)}
              multiline
              style={styles.textInput}
            />
            <Text style={styles.fieldLabel}>Answer</Text>
            <TextInput
              value={s.answer}
              onChangeText={(v) => updateField(index, 'answer', v)}
              multiline
              style={styles.textInput}
            />
          </View>
        ))}

        <View style={styles.footer}>
          <PrimaryButton
            label={`Save ${suggestions.filter((s) => s.included).length} question(s)`}
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
  fieldLabel: { ...typography.label, color: colors.textFaint },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  footer: { marginTop: spacing.md },
});
