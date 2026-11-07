import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { todayLocalDate } from '../../checkins/checkinEngine';
import { dueFollowUps } from '../../prep/interviewEngine';
import { usePrepState } from '../../state/PrepStateContext';

export default function PrepScreen() {
  const router = useRouter();
  const { interviews, studyQuestions } = usePrepState();
  const today = useMemo(() => todayLocalDate(), []);
  const due = useMemo(() => dueFollowUps(interviews, today), [interviews, today]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Prep</Text>
        <Text style={styles.helper}>
          Interview tracking, plus study practice you write yourself or generate with AI from your imported notes.
        </Text>

        <PressableScale style={styles.card} onPress={() => router.push('/interviews')}>
          <Text style={styles.cardTitle}>Interview tracker</Text>
          <Text style={styles.cardBody}>
            {interviews.length} interview{interviews.length === 1 ? '' : 's'} tracked
            {due.length > 0 ? ` · ${due.length} follow-up suggestion${due.length === 1 ? '' : 's'}` : ''}
          </Text>
        </PressableScale>

        <PressableScale style={styles.card} onPress={() => router.push('/notes')}>
          <Text style={styles.cardTitle}>Study notes</Text>
          <Text style={styles.cardBody}>
            {studyQuestions.length} question{studyQuestions.length === 1 ? '' : 's'} saved from your notes
          </Text>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.display, fontSize: 28, color: colors.text },
  helper: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardTitle: { ...typography.heading, fontSize: 17, color: colors.text },
  cardBody: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
