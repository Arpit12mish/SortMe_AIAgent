import React from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { colors, glow, radii, spacing, typography } from './theme';
import { PressableScale } from './ui';
import { VoiceWaveform } from './VoiceWaveform';
import { useSpeechToText } from '../voice/useSpeechToText';

export interface WizardOption {
  label: string;
  value: string;
}

/**
 * One question in a guided wizard: an optional row of tap-to-answer-and-
 * advance option chips, plus an always-present mic/transcript field (same
 * mic-button + VoiceWaveform + TextInput pattern as src/app/capture.tsx) for
 * typing or speaking a custom answer. Render this keyed by the question id
 * (`<WizardQuestion key={question.id} .../>`) so moving to the next question
 * remounts it and gets a fresh speech-to-text session automatically.
 */
export function WizardQuestion({
  prompt,
  options,
  value,
  onChangeValue,
  onSubmit,
  placeholder = 'Type or speak your answer…',
}: {
  prompt: string;
  options?: WizardOption[];
  value: string;
  onChangeValue: (v: string) => void;
  onSubmit: (finalValue: string) => void;
  placeholder?: string;
}) {
  const stt = useSpeechToText();
  const isListening = stt.status === 'listening';

  const handleMicPress = () => {
    if (isListening) {
      stt.stop();
    } else {
      stt.start();
    }
  };

  const handleChangeText = (text: string) => {
    stt.setTranscript(text);
    onChangeValue(text);
  };

  // The live transcript drives the shared value as it updates, matching
  // capture.tsx's behavior of typing and speaking sharing one field.
  React.useEffect(() => {
    if (stt.transcript) onChangeValue(stt.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.transcript]);

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>{prompt}</Text>

      {options && options.length > 0 && (
        <View style={styles.optionRow}>
          {options.map((o) => (
            <PressableScale key={o.value} onPress={() => onSubmit(o.value)} scaleTo={0.95} style={styles.option}>
              <Text style={styles.optionText}>{o.label}</Text>
            </PressableScale>
          ))}
        </View>
      )}

      <View style={styles.micSection}>
        <PressableScale onPress={handleMicPress} scaleTo={0.94} style={[styles.micButton, isListening && styles.micButtonActive]}>
          <Text style={styles.micGlyph}>{isListening ? '◼' : '🎤'}</Text>
        </PressableScale>
        <VoiceWaveform level={stt.level} active={isListening} />
      </View>

      {stt.status === 'error' && stt.errorMessage && <Text style={styles.errorText}>{stt.errorMessage}</Text>}

      <TextInput
        value={value}
        onChangeText={handleChangeText}
        multiline
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.textInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  prompt: { ...typography.heading, fontSize: 18, color: colors.text },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionText: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  micSection: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary, ...glow(colors.primary) },
  micGlyph: { fontSize: 28 },
  errorText: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
