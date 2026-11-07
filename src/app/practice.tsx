import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import type { Confidence } from '../prep/types';
import { usePrepState } from '../state/PrepStateContext';

const CONFIDENCE_OPTIONS: { value: Confidence; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function PracticeScreen() {
  const router = useRouter();
  const { dailyPracticeSet, recordAttempt, notes } = usePrepState();
  const set = useMemo(() => dailyPracticeSet(5), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  if (set.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No questions yet. Add some from a note first.</Text>
          <SecondaryButton label="Close" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (index >= set.length) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.summaryTitle}>Practice complete</Text>
          <Text style={styles.emptyText}>
            {done} of {set.length} question{set.length === 1 ? '' : 's'} practiced.
          </Text>
          <PrimaryButton label="Done" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const question = set[index];
  const note = notes.find((n) => n.id === question.noteId);

  const rate = async (confidence: Confidence) => {
    await recordAttempt(question.id, confidence);
    setDone((d) => d + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.progress}>
          {index + 1} of {set.length} · {question.topic}
          {note ? ` · from "${note.title}"` : ''}
        </Text>
        <Text style={styles.question}>{question.question}</Text>

        {revealed ? (
          <>
            <Text style={styles.answer}>{question.answer}</Text>
            <Text style={styles.rateLabel}>How confident were you?</Text>
            <View style={styles.confidenceRow}>
              {CONFIDENCE_OPTIONS.map((o) => (
                <SecondaryButton key={o.value} label={o.label} onPress={() => rate(o.value)} />
              ))}
            </View>
          </>
        ) : (
          <PrimaryButton label="Reveal answer" onPress={() => setRevealed(true)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  progress: { ...typography.micro, color: colors.textMuted, textAlign: 'center' },
  question: { ...typography.title, fontSize: 20, color: colors.text, textAlign: 'center', marginVertical: spacing.lg },
  answer: {
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  rateLabel: { ...typography.caption, fontWeight: '600', color: colors.textMuted, marginTop: spacing.lg, textAlign: 'center' },
  confidenceRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  emptyText: { color: colors.textMuted, ...typography.bodyStrong, fontSize: 15, textAlign: 'center' },
  summaryTitle: { ...typography.heading, fontSize: 22, color: colors.text },
});
