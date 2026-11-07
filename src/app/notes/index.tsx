import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import type { Note } from '../../prep/types';
import { usePrepState } from '../../state/PrepStateContext';

function NoteRow({ note, questionCount }: { note: Note; questionCount: number }) {
  const router = useRouter();
  return (
    <PressableScale style={styles.row} onPress={() => router.push({ pathname: '/notes/[id]', params: { id: note.id } })}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{note.title}</Text>
        <Text style={styles.topic}>{note.topic}</Text>
      </View>
      <Text style={styles.rowSubtitle}>
        {questionCount} question{questionCount === 1 ? '' : 's'}
      </Text>
    </PressableScale>
  );
}

export default function NotesScreen() {
  const router = useRouter();
  const { notes, studyQuestions } = usePrepState();
  const sorted = useMemo(
    () => [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [notes]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <PrimaryButton label="+ New note" onPress={() => router.push('/notes/new')} />
        <PrimaryButton label="Practice today's set" onPress={() => router.push('/practice')} />
        <SecondaryButton label="What should I prioritize?" onPress={() => router.push('/prep-priorities')} />
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <NoteRow note={item} questionCount={studyQuestions.filter((q) => q.noteId === item.id).length} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No notes yet. Add one, then turn it into Q&amp;A pairs to practice.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  rowTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text, flex: 1 },
  topic: { ...typography.label, color: colors.textMuted },
  rowSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
