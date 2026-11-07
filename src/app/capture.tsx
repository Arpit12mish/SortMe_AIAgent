import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { colors, glow, radii, shadows, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { classifyVoiceCapture, type VoiceDestination } from '../voice/intentClassifier';
import { useSpeechToText } from '../voice/useSpeechToText';

const DESTINATION_LABEL: Record<VoiceDestination, string> = {
  urgent_task: 'Urgent task',
  task: 'Task',
  interview: 'Interview notes',
  mood: 'Mood / check-in',
  note: 'Note',
  quiz: "Today's quiz",
};

export default function CaptureScreen() {
  const router = useRouter();
  const stt = useSpeechToText();
  const [override, setOverride] = useState<VoiceDestination | null>(null);

  const suggestion = useMemo(
    () => (stt.transcript.trim().length > 0 ? classifyVoiceCapture(stt.transcript) : null),
    [stt.transcript]
  );
  const destination = override ?? suggestion?.destination ?? null;
  const isListening = stt.status === 'listening';
  const hasTranscript = stt.transcript.trim().length > 0;

  const handleMicPress = () => {
    if (isListening) stt.stop();
    else stt.start();
  };

  const handleStartOver = () => {
    stt.reset();
    setOverride(null);
  };

  const handleContinue = () => {
    if (!destination || !suggestion) return;

    switch (destination) {
      case 'urgent_task': {
        const params: Record<string, string> = { urgent: '1', title: suggestion.titleGuess };
        // task-new's own urgent-preset default is "tomorrow 9am" — only override it when the
        // transcript actually named a day, so an unrelated-but-urgent capture isn't forced to today.
        if (suggestion.deadlineOffsetDays !== null) {
          params.dueOffsetDays = String(suggestion.deadlineOffsetDays);
        }
        router.push({ pathname: '/task-new', params });
        return;
      }
      case 'task': {
        const params: Record<string, string> = { title: suggestion.titleGuess };
        if (suggestion.deadlineOffsetDays !== null) {
          params.dueOffsetDays = String(suggestion.deadlineOffsetDays);
        }
        router.push({ pathname: '/task-new', params });
        return;
      }
      case 'interview':
        router.push({ pathname: '/interviews/new', params: { notes: stt.transcript.trim() } });
        return;
      case 'note':
        router.push({ pathname: '/notes/new', params: { title: suggestion.titleGuess, body: stt.transcript.trim() } });
        return;
      case 'mood':
        router.push({ pathname: '/checkin-evening', params: { notes: stt.transcript.trim() } });
        return;
      case 'quiz':
        router.push('/practice');
        return;
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>
          Talk through whatever&apos;s on your mind — a task, an interview, your mood, notes to revise, or just say
          &ldquo;quiz me.&rdquo; SortMe will suggest where it goes.
        </Text>

        <View style={styles.micSection}>
          <PressableScale
            onPress={handleMicPress}
            scaleTo={0.94}
            style={[styles.micButton, isListening && styles.micButtonActive]}
          >
            <Text style={styles.micGlyph}>{isListening ? '◼' : '🎤'}</Text>
          </PressableScale>
          <Text style={styles.micStatus}>
            {stt.status === 'requesting_permission'
              ? 'Requesting permission…'
              : isListening
                ? 'Listening — tap to stop'
                : hasTranscript
                  ? 'Tap to re-record'
                  : 'Tap to talk'}
          </Text>
          <VoiceWaveform level={stt.level} active={isListening} />
        </View>

        {stt.status === 'error' && stt.errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{stt.errorMessage}</Text>
          </View>
        )}

        <View style={styles.transcriptCard}>
          <Text style={styles.sectionLabel}>
            {hasTranscript ? 'Transcript — edit if anything was misheard' : "Didn't catch that, or prefer to type?"}
          </Text>
          <TextInput
            value={stt.transcript}
            onChangeText={stt.setTranscript}
            multiline
            placeholder="Type here instead…"
            placeholderTextColor={colors.textFaint}
            style={styles.transcriptInput}
          />
        </View>

        {suggestion && (
          <View style={styles.suggestionCard}>
            <Text style={styles.sectionLabel}>Where should this go?</Text>
            <Text style={styles.reasonText}>{suggestion.reason}</Text>
            <View style={styles.chipRow}>
              {(Object.keys(DESTINATION_LABEL) as VoiceDestination[]).map((d) => (
                <PressableScale
                  key={d}
                  scaleTo={0.93}
                  onPress={() => setOverride(d)}
                  style={[styles.chip, destination === d && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, destination === d && styles.chipTextSelected]}>
                    {DESTINATION_LABEL[d]}
                  </Text>
                </PressableScale>
              ))}
            </View>

            <View style={styles.actions}>
              <PrimaryButton label={`Continue to ${DESTINATION_LABEL[destination!].toLowerCase()}`} onPress={handleContinue} />
              <GhostButton label="Start over" onPress={handleStartOver} />
            </View>
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
  micSection: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  micButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...glow(colors.primary),
  },
  micGlyph: { fontSize: 36 },
  micStatus: { ...typography.caption, color: colors.textMuted },
  errorBanner: {
    backgroundColor: colors.tintDanger,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
  transcriptCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  sectionLabel: { ...typography.label, color: colors.textFaint },
  transcriptInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestionCard: {
    backgroundColor: colors.cardElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  reasonText: { ...typography.caption, color: colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.primaryText },
  actions: { marginTop: spacing.sm, gap: spacing.sm },
});
