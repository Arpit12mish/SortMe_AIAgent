import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, radii, spacing } from '../components/theme';
import { TimeField, isValidTime } from '../components/TimeField';
import { FixedCommitmentsEditor } from '../components/editors/FixedCommitmentsEditor';
import { FocusBlocksEditor } from '../components/editors/FocusBlocksEditor';
import { GoalsEditor } from '../components/editors/GoalsEditor';
import { MealWindowsEditor } from '../components/editors/MealWindowsEditor';
import type { FixedCommitment, Goal, MealWindows, TimeRange } from '../planning/types';
import { useAppState } from '../state/AppStateContext';

const STEP_TITLES = [
  'Sleep & timezone',
  'Fixed commitments',
  'Meal windows',
  'Preferred focus time',
  'Goals',
  'Review',
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAppState();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [commitments, setCommitments] = useState<FixedCommitment[]>([]);
  const [meals, setMeals] = useState<MealWindows>({
    breakfast: { start: '08:00', end: '08:30' },
    lunch: { start: '13:00', end: '13:30' },
    dinner: { start: '20:00', end: '20:30' },
  });
  const [focusBlocks, setFocusBlocks] = useState<TimeRange[]>([{ start: '18:00', end: '22:00' }]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadSample, setLoadSample] = useState(true);

  const canProceedFromSleep = isValidTime(wakeTime) && isValidTime(sleepTime);
  const isLast = step === STEP_TITLES.length - 1;

  const handleFinish = async () => {
    if (!canProceedFromSleep) {
      setStep(0);
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding(
        {
          timezone,
          sleepWindow: { wakeTime, sleepTime },
          fixedCommitments: commitments,
          goals,
          preferredFocusBlocks: focusBlocks,
          mealWindows: meals,
          onboardingCompletedAt: new Date().toISOString(),
        },
        { loadSampleScenario: loadSample }
      );
      router.replace('/(tabs)');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.stepIndicator}>
          Step {step + 1} of {STEP_TITLES.length}
        </Text>
        <Text style={styles.title}>{STEP_TITLES[step]}</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {step === 0 && (
          <View>
            <Text style={styles.helper}>Detected timezone: {timezone}. You can change this later in Settings.</Text>
            <View style={styles.rowGap}>
              <TimeField label="Wake up" value={wakeTime} onChange={setWakeTime} />
              <TimeField label="Sleep" value={sleepTime} onChange={setSleepTime} />
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.helper}>
              Classes, work, or anything on a fixed schedule. SortMe will never move these.
            </Text>
            <FixedCommitmentsEditor value={commitments} onChange={setCommitments} />
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.helper}>Protected windows for meals. SortMe schedules around these.</Text>
            <MealWindowsEditor value={meals} onChange={setMeals} />
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.helper}>
              When you focus best. SortMe prefers these windows for important tasks when there&apos;s room.
            </Text>
            <FocusBlocksEditor value={focusBlocks} onChange={setFocusBlocks} />
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.helper}>What are you working toward? SortMe uses these for context, not scoring.</Text>
            <GoalsEditor value={goals} onChange={setGoals} />
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={styles.helper}>
              Wake {wakeTime} · Sleep {sleepTime} · {commitments.length} fixed commitment(s) ·{' '}
              {focusBlocks.length} focus window(s) · {goals.length} goal(s)
            </Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Try it with sample data</Text>
              <Text style={styles.cardSubtitle}>
                Loads an example evening (interview prep, portfolio work, study) so you can try the
                urgent-task replanning flow right away. You can delete it anytime from Settings.
              </Text>
              <SecondaryButton
                label={loadSample ? 'Sample data: On' : 'Sample data: Off'}
                onPress={() => setLoadSample((v) => !v)}
              />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <SecondaryButton label="Back" onPress={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} />
        {isLast ? (
          <PrimaryButton label="Finish" onPress={handleFinish} loading={submitting} disabled={!canProceedFromSleep} />
        ) : (
          <PrimaryButton
            label="Next"
            onPress={() => setStep((s) => Math.min(STEP_TITLES.length - 1, s + 1))}
            disabled={step === 0 && !canProceedFromSleep}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  stepIndicator: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, paddingTop: 0 },
  helper: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  rowGap: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
