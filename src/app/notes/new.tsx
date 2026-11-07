import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Buttons';
import { colors, radii, spacing, typography } from '../../components/theme';
import { usePrepState } from '../../state/PrepStateContext';

export default function NewNoteScreen() {
  const router = useRouter();
  const { addNote } = usePrepState();
  // Voice capture prefill — see src/app/capture.tsx.
  const { title: prefillTitle, body: prefillBody } = useLocalSearchParams<{ title?: string; body?: string }>();
  const [title, setTitle] = useState(prefillTitle ?? '');
  const [topic, setTopic] = useState('');
  const [body, setBody] = useState(prefillBody ?? '');
  const [working, setWorking] = useState(false);

  const canSave = title.trim().length > 0 && topic.trim().length > 0;

  const handleSave = async () => {
    setWorking(true);
    try {
      const note = await addNote({ title: title.trim(), topic: topic.trim(), body });
      router.replace({ pathname: '/notes/[id]', params: { id: note.id } });
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Behavioral notes"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Topic</Text>
        <TextInput
          style={styles.input}
          value={topic}
          onChangeText={setTopic}
          placeholder="behavioral"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.bodyInput}
          value={body}
          onChangeText={setBody}
          placeholder="Paste or type your notes here"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <PrimaryButton label="Save note" onPress={handleSave} disabled={!canSave} loading={working} />
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
  bodyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 160,
    marginBottom: spacing.lg,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
});
