import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { deriveEveningSummary } from '../checkins/checkinEngine';
import { useAppState } from '../state/AppStateContext';
import { useCheckIns } from '../state/CheckInContext';

type Bucket = 'completed' | 'unfinished' | 'deferred';

const BUCKET_LABEL: Record<Bucket, string> = {
  completed: 'Completed',
  unfinished: 'Unfinished',
  deferred: 'Deferred',
};

const BUCKET_COLOR: Record<Bucket, string> = {
  completed: colors.success,
  unfinished: colors.warning,
  deferred: colors.textMuted,
};

const NEXT_BUCKET: Record<Bucket, Bucket> = {
  completed: 'unfinished',
  unfinished: 'deferred',
  deferred: 'completed',
};

export default function CheckInEveningScreen() {
  const router = useRouter();
  const { currentPlan, tasks } = useAppState();
  const { saveEveningReview } = useCheckIns();
  // Voice capture prefill — see src/app/capture.tsx.
  const { notes: prefillNotes } = useLocalSearchParams<{ notes?: string }>();

  const defaults = useMemo(() => deriveEveningSummary(currentPlan, tasks), [currentPlan, tasks]);
  const [buckets, setBuckets] = useState<Record<string, Bucket>>(() => {
    const map: Record<string, Bucket> = {};
    defaults.completedTaskIds.forEach((id) => (map[id] = 'completed'));
    defaults.unfinishedTaskIds.forEach((id) => (map[id] = 'unfinished'));
    defaults.deferredTaskIds.forEach((id) => (map[id] = 'deferred'));
    return map;
  });
  const [notes, setNotes] = useState(prefillNotes ?? '');
  const [working, setWorking] = useState(false);

  const taskIds = Object.keys(buckets);
  const cycle = (taskId: string) => {
    setBuckets((prev) => ({ ...prev, [taskId]: NEXT_BUCKET[prev[taskId]] }));
  };

  const handleSave = async () => {
    setWorking(true);
    try {
      const completedTaskIds = taskIds.filter((id) => buckets[id] === 'completed');
      const unfinishedTaskIds = taskIds.filter((id) => buckets[id] === 'unfinished');
      const deferredTaskIds = taskIds.filter((id) => buckets[id] === 'deferred');
      await saveEveningReview({ completedTaskIds, unfinishedTaskIds, deferredTaskIds, notes: notes || undefined });
      router.back();
    } finally {
      setWorking(false);
    }
  };

  if (taskIds.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>No tasks were part of today&apos;s plan yet.</Text>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput style={styles.noteInput} value={notes} onChangeText={setNotes} multiline />
          <PrimaryButton label="Save review" onPress={handleSave} loading={working} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>Tap a task to move it between Completed, Unfinished, and Deferred.</Text>
        {taskIds.map((taskId) => {
          const task = tasks.find((t) => t.id === taskId);
          const bucket = buckets[taskId];
          return (
            <PressableScale key={taskId} onPress={() => cycle(taskId)} style={styles.row}>
              <Text style={styles.rowTitle}>{task?.title ?? taskId}</Text>
              <Text style={[styles.badge, { color: BUCKET_COLOR[bucket] }]}>{BUCKET_LABEL[bucket]}</Text>
            </PressableScale>
          );
        })}

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={styles.noteInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="How did today go?"
          multiline
        />

        <PrimaryButton label="Save review" onPress={handleSave} loading={working} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  rowTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text, flex: 1 },
  badge: { ...typography.caption, fontWeight: '700' },
  label: { ...typography.caption, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 80,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
});
