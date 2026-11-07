import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { OUTCOME_LABEL, STAGE_LABEL } from '../../prep/interviewEngine';
import type { InterviewOutcome, InterviewStage } from '../../prep/types';
import { usePrepState } from '../../state/PrepStateContext';

const STAGES = Object.keys(STAGE_LABEL) as InterviewStage[];
const OUTCOMES = Object.keys(OUTCOME_LABEL) as InterviewOutcome[];

export default function InterviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { interviews, updateInterview, removeInterview } = usePrepState();
  const entry = interviews.find((e) => e.id === id);
  const [newQuestion, setNewQuestion] = useState('');

  if (!entry) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>This interview no longer exists.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const addQuestion = () => {
    const q = newQuestion.trim();
    if (!q) return;
    updateInterview(entry.id, { questionsAsked: [...entry.questionsAsked, q] });
    setNewQuestion('');
  };

  const removeQuestionAt = (index: number) => {
    updateInterview(entry.id, { questionsAsked: entry.questionsAsked.filter((_, i) => i !== index) });
  };

  const confirmDelete = () => {
    Alert.alert('Delete interview', `Remove ${entry.company} — ${entry.role}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await removeInterview(entry.id); router.back(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.company}>{entry.company}</Text>
        <Text style={styles.role}>{entry.role}</Text>

        <Text style={styles.label}>Stage</Text>
        <View style={styles.optionRow}>
          {STAGES.map((s) => (
            <PressableScale
              key={s}
              onPress={() => updateInterview(entry.id, { stage: s })}
              scaleTo={0.93}
              style={[styles.option, entry.stage === s && styles.optionSelected]}
            >
              <Text style={[styles.optionText, entry.stage === s && styles.optionTextSelected]}>{STAGE_LABEL[s]}</Text>
            </PressableScale>
          ))}
        </View>

        <Text style={styles.label}>Outcome</Text>
        <View style={styles.optionRow}>
          {OUTCOMES.map((o) => (
            <PressableScale
              key={o}
              onPress={() => updateInterview(entry.id, { outcome: o })}
              scaleTo={0.93}
              style={[styles.option, entry.outcome === o && styles.optionSelected]}
            >
              <Text style={[styles.optionText, entry.outcome === o && styles.optionTextSelected]}>{OUTCOME_LABEL[o]}</Text>
            </PressableScale>
          ))}
        </View>

        <Text style={styles.label}>Follow-up date (YYYY-MM-DD, optional)</Text>
        <TextInput
          style={styles.input}
          value={entry.followUpDate ?? ''}
          onChangeText={(v) => updateInterview(entry.id, { followUpDate: v || undefined })}
          placeholder="2026-10-15"
          placeholderTextColor={colors.textMuted}
        />
        <PressableScale
          scaleTo={0.96}
          style={{ alignSelf: 'flex-start' }}
          onPress={() => updateInterview(entry.id, { followUpDone: !entry.followUpDone })}
        >
          <Text style={[styles.toggle, entry.followUpDone && styles.toggleDone]}>
            {entry.followUpDone ? '✓ Follow-up done' : 'Mark follow-up as done'}
          </Text>
        </PressableScale>

        <Text style={styles.label}>Questions asked</Text>
        {entry.questionsAsked.map((q, i) => (
          <PressableScale key={i} onPress={() => removeQuestionAt(i)} style={styles.questionRow}>
            <Text style={styles.questionText}>• {q}</Text>
            <Text style={styles.removeHint}>tap to remove</Text>
          </PressableScale>
        ))}
        <View style={styles.addQuestionRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={newQuestion}
            onChangeText={setNewQuestion}
            placeholder="Add a question they asked"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={addQuestion}
          />
          <SecondaryButton label="Add" onPress={addQuestion} />
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.noteInput}
          value={entry.notes ?? ''}
          onChangeText={(v) => updateInterview(entry.id, { notes: v || undefined })}
          multiline
        />

        <View style={styles.footer}>
          <DangerButton label="Delete" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  company: { ...typography.heading, fontSize: 22, color: colors.text },
  role: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
  label: { ...typography.caption, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.tintPrimary },
  optionText: { ...typography.caption, fontWeight: '600', color: colors.text },
  optionTextSelected: { color: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  toggle: { ...typography.caption, fontWeight: '600', color: colors.primary, marginTop: spacing.xs },
  toggleDone: { color: colors.success },
  questionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  questionText: { ...typography.caption, color: colors.text, flex: 1 },
  removeHint: { ...typography.micro, color: colors.textMuted },
  addQuestionRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  footer: { marginTop: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted },
});
