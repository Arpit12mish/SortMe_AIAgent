import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton, GhostButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { usePrepState } from '../../state/PrepStateContext';

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, studyQuestions, updateNote, removeNote, addQuestion, removeQuestion } = usePrepState();
  const note = notes.find((n) => n.id === id);
  const questions = studyQuestions.filter((q) => q.noteId === id);

  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [adding, setAdding] = useState(false);

  if (!note) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>This note no longer exists.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleAddQuestion = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    setAdding(true);
    try {
      await addQuestion({ noteId: note.id, question: newQuestion.trim(), answer: newAnswer.trim() });
      setNewQuestion('');
      setNewAnswer('');
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete note', `Delete "${note.title}" and its questions?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeNote(note.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={note.title} onChangeText={(v) => updateNote(note.id, { title: v })} />

        <Text style={styles.label}>Topic</Text>
        <TextInput style={styles.input} value={note.topic} onChangeText={(v) => updateNote(note.id, { topic: v })} />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.bodyInput}
          value={note.body}
          onChangeText={(v) => updateNote(note.id, { body: v })}
          multiline
        />

        <Text style={styles.sectionTitle}>Q&amp;A pairs ({questions.length})</Text>
        {questions.map((q) => (
          <View key={q.id} style={styles.questionCard}>
            <Text style={styles.questionText}>Q: {q.question}</Text>
            <Text style={styles.answerText}>A: {q.answer}</Text>
            <GhostButton label="Remove" onPress={() => removeQuestion(q.id)} tone="danger" />
          </View>
        ))}

        <View style={styles.addCard}>
          <Text style={styles.label}>New question</Text>
          <TextInput
            style={styles.input}
            value={newQuestion}
            onChangeText={setNewQuestion}
            placeholder="Question"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Answer</Text>
          <TextInput
            style={styles.bodyInputSmall}
            value={newAnswer}
            onChangeText={setNewAnswer}
            placeholder="Answer, from your notes"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <SecondaryButton label="Add Q&A pair" onPress={handleAddQuestion} disabled={adding} />
        </View>

        <View style={styles.footer}>
          <DangerButton label="Delete note" onPress={confirmDelete} />
        </View>
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
    minHeight: 120,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  bodyInputSmall: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 60,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textFaint,
    marginTop: spacing.lg,
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    ...shadows.card,
  },
  questionText: { ...typography.caption, fontWeight: '600', color: colors.text },
  answerText: { ...typography.caption, color: colors.textMuted },
  removeLink: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, fontWeight: '600' },
  addCard: { marginTop: spacing.lg, gap: spacing.sm },
  footer: { marginTop: spacing.xl },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted },
});
