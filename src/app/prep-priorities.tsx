import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPrepPriorities } from '../ai/api';
import type { PrioritizedNote } from '../ai/types';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { ApiError } from '../connections/types';
import { nearestUpcomingInterview } from '../prep/interviewEngine';
import { usePrepState } from '../state/PrepStateContext';

export default function PrepPrioritiesScreen() {
  const router = useRouter();
  const { interviews, notes } = usePrepState();

  const [nowMs] = useState(() => Date.now());
  const nearestInterview = useMemo(() => nearestUpcomingInterview(interviews, nowMs), [interviews, nowMs]);

  const [context, setContext] = useState(
    nearestInterview ? `${nearestInterview.role} interview at ${nearestInterview.company}` : ''
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [interviewContext, setInterviewContext] = useState('');
  const [prioritized, setPrioritized] = useState<PrioritizedNote[]>([]);

  const run = async () => {
    setStatus('loading');
    try {
      const response = await getPrepPriorities(context.trim() || undefined);
      setInterviewContext(response.interviewContext);
      setPrioritized(response.prioritizedNotes);
      setStatus('ready');
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.message : 'Could not get priorities right now.');
      setStatus('error');
    }
  };

  const noteFor = (importedDocumentId: string) =>
    notes.find((n) => n.source === 'google_doc' && n.sourceRef === importedDocumentId);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>
          Cross-references your recently synced emails against your imported notes to suggest what to revise next.
        </Text>

        <Text style={styles.fieldLabel}>Interview context (optional)</Text>
        <TextInput
          value={context}
          onChangeText={setContext}
          placeholder="e.g. Android role at Acme"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />

        <PrimaryButton label="Get priorities" onPress={run} loading={status === 'loading'} />

        {status === 'error' && <Text style={styles.errorText}>{errorMessage}</Text>}

        {status === 'ready' && (
          <View style={styles.resultBlock}>
            <Text style={styles.contextText}>{interviewContext}</Text>

            {prioritized.length === 0 ? (
              <Text style={styles.helper}>No specific notes stand out — nothing to prioritize right now.</Text>
            ) : (
              prioritized.map((p) => {
                const existingNote = noteFor(p.importedDocumentId);
                return (
                  <View key={p.importedDocumentId} style={styles.card}>
                    <Text style={styles.rank}>#{p.priorityRank}</Text>
                    <Text style={styles.cardTitle}>{p.title}</Text>
                    <Text style={styles.reason}>{p.reason}</Text>
                    {existingNote ? (
                      <SecondaryButton
                        label="Open note"
                        onPress={() => router.push({ pathname: '/notes/[id]', params: { id: existingNote.id } })}
                      />
                    ) : (
                      <SecondaryButton
                        label="Generate quiz questions"
                        onPress={() =>
                          router.push({
                            pathname: '/connections/google-docs-questions',
                            params: { rawDocId: p.importedDocumentId, title: p.title },
                          })
                        }
                      />
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  helper: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  fieldLabel: { ...typography.label, color: colors.textFaint },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  errorText: { ...typography.body, color: colors.danger },
  resultBlock: { gap: spacing.sm, marginTop: spacing.sm },
  contextText: { ...typography.body, color: colors.text, fontStyle: 'italic' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  rank: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  reason: { ...typography.caption, color: colors.textMuted },
  center: { alignItems: 'center', padding: spacing.lg },
});
