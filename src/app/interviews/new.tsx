import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Buttons';
import { colors, radii, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { STAGE_LABEL } from '../../prep/interviewEngine';
import type { InterviewStage } from '../../prep/types';
import { usePrepState } from '../../state/PrepStateContext';

const STAGES = Object.keys(STAGE_LABEL) as InterviewStage[];

export default function NewInterviewScreen() {
  const router = useRouter();
  const { addInterview } = usePrepState();
  // Voice capture prefill — see src/app/capture.tsx.
  const { notes: prefillNotes } = useLocalSearchParams<{ notes?: string }>();
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [stage, setStage] = useState<InterviewStage>('applied');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState(prefillNotes ?? '');
  const [working, setWorking] = useState(false);

  const canSave = company.trim().length > 0 && role.trim().length > 0;

  const handleSave = async () => {
    setWorking(true);
    try {
      await addInterview({
        company: company.trim(),
        role: role.trim(),
        stage,
        outcome: 'pending',
        followUpDate: followUpDate.trim() || undefined,
        questionsAsked: [],
        notes: notes.trim() || undefined,
      });
      router.back();
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Company</Text>
        <TextInput
          style={styles.input}
          value={company}
          onChangeText={setCompany}
          placeholder="Acme Corp"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Role</Text>
        <TextInput
          style={styles.input}
          value={role}
          onChangeText={setRole}
          placeholder="Software Engineer"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Stage</Text>
        <View style={styles.optionRow}>
          {STAGES.map((s) => (
            <PressableScale
              key={s}
              onPress={() => setStage(s)}
              scaleTo={0.93}
              style={[styles.option, stage === s && styles.optionSelected]}
            >
              <Text style={[styles.optionText, stage === s && styles.optionTextSelected]}>{STAGE_LABEL[s]}</Text>
            </PressableScale>
          ))}
        </View>

        <Text style={styles.label}>Follow-up date (optional, YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={followUpDate}
          onChangeText={setFollowUpDate}
          placeholder="2026-10-15"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput style={styles.noteInput} value={notes} onChangeText={setNotes} multiline />

        <PrimaryButton label="Add interview" onPress={handleSave} disabled={!canSave} loading={working} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  label: { ...typography.caption, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 70,
    marginBottom: spacing.lg,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
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
});
