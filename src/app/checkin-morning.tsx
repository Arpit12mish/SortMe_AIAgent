import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { WizardQuestion } from '../components/WizardQuestion';
import type { WizardOption } from '../components/WizardQuestion';
import { inferEnergyLevel, parseAvailableMinutes } from '../checkins/checkinEngine';
import type { EnergyLevel } from '../checkins/types';
import { nearestUpcomingInterview } from '../prep/interviewEngine';
import { useAppState } from '../state/AppStateContext';
import { useCheckIns } from '../state/CheckInContext';
import { usePrepState } from '../state/PrepStateContext';
import { useReminders } from '../state/ReminderStateContext';

interface QuestionStep {
  id: string;
  prompt: string;
  options?: WizardOption[];
  placeholder?: string;
}

const ENERGY_OPTIONS: WizardOption[] = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
];

const TIME_OPTIONS: WizardOption[] = [
  { label: '2 hours', value: '120' },
  { label: '4 hours', value: '240' },
  { label: '6 hours', value: '360' },
  { label: '8+ hours', value: '480' },
];

export default function CheckInMorningScreen() {
  const router = useRouter();
  const { currentPlan, reportEnergyChanged } = useAppState();
  const { saveMorningCheckIn } = useCheckIns();
  const { syncCheckInReminders } = useReminders();
  const { interviews } = usePrepState();

  const [nowMs] = useState(() => Date.now());
  const upcomingInterview = useMemo(() => {
    const found = nearestUpcomingInterview(interviews, nowMs);
    if (!found || !found.interviewDate) return null;
    const daysAway = (new Date(found.interviewDate).getTime() - nowMs) / (24 * 60 * 60 * 1000);
    return daysAway <= 7 ? found : null;
  }, [interviews, nowMs]);

  const questions = useMemo<QuestionStep[]>(() => {
    const steps: QuestionStep[] = [
      { id: 'mood', prompt: 'How are you feeling this morning?', options: [
        { label: 'Great', value: 'Great' },
        { label: 'Good', value: 'Good' },
        { label: 'Okay', value: 'Okay' },
        { label: 'Stressed', value: 'Stressed' },
        { label: 'Tired', value: 'Tired' },
      ] },
      { id: 'energy', prompt: "How's your energy today?", options: ENERGY_OPTIONS },
      { id: 'time', prompt: 'How much focused time do you have today?', options: TIME_OPTIONS, placeholder: 'e.g. about 3 hours' },
      { id: 'urgentTask', prompt: 'Anything new or urgent on your mind today?', options: [{ label: 'Nothing today', value: '' }] },
    ];
    if (upcomingInterview) {
      steps.push({
        id: 'interviewPrep',
        prompt: `You have a ${upcomingInterview.role} interview at ${upcomingInterview.company} coming up. Prioritize revision for it today?`,
        options: [
          { label: 'Yes, prioritize it', value: 'yes' },
          { label: 'Not today', value: 'no' },
        ],
      });
    }
    steps.push({ id: 'notes', prompt: 'Anything else you want to note for today?', options: [{ label: 'Nothing else', value: '' }] });
    return steps;
  }, [upcomingInterview]);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isReview = step === questions.length;
  const current = questions[step];

  const handleAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
    setDraft('');
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step === 0) {
      router.back();
      return;
    }
    setDraft(answers[questions[step - 1]?.id] ?? '');
    setStep((s) => s - 1);
  };

  const resolvedEnergy: EnergyLevel = /^(low|normal|high)$/.test(answers.energy ?? '')
    ? (answers.energy as EnergyLevel)
    : inferEnergyLevel(answers.energy ?? '');
  const resolvedMinutes = /^\d+$/.test(answers.time ?? '') ? Number(answers.time) : parseAvailableMinutes(answers.time ?? '');
  const urgentTaskTitle = (answers.urgentTask ?? '').trim();
  const interviewPrepOptedIn = answers.interviewPrep === 'yes';
  const notes = (answers.notes ?? '').trim();

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await saveMorningCheckIn({
        energyLevel: resolvedEnergy,
        availableMinutes: resolvedMinutes,
        mood: answers.mood || undefined,
        notes: notes || undefined,
      });
      await syncCheckInReminders();

      if (urgentTaskTitle) {
        router.replace({ pathname: '/task-new', params: { title: urgentTaskTitle } });
        return;
      }
      if (interviewPrepOptedIn) {
        router.replace('/prep-priorities');
        return;
      }
      if (resolvedEnergy !== 'normal' && currentPlan) {
        await reportEnergyChanged(resolvedEnergy);
        router.replace('/replan-review');
        return;
      }
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.stepIndicator}>
          {isReview ? 'Review' : `Question ${step + 1} of ${questions.length}`}
        </Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {!isReview && (
          <WizardQuestion
            key={current.id}
            prompt={current.prompt}
            options={current.options}
            value={draft}
            onChangeValue={setDraft}
            onSubmit={handleAnswer}
            placeholder={current.placeholder}
          />
        )}

        {isReview && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewLine}>Mood: {answers.mood || 'Not set'}</Text>
            <Text style={styles.reviewLine}>Energy: {resolvedEnergy}</Text>
            <Text style={styles.reviewLine}>
              Available time: {resolvedMinutes ? `${resolvedMinutes} min` : 'Not set'}
            </Text>
            <Text style={styles.reviewLine}>Urgent task: {urgentTaskTitle || 'None'}</Text>
            {upcomingInterview && (
              <Text style={styles.reviewLine}>
                Interview prep: {interviewPrepOptedIn ? `Prioritizing ${upcomingInterview.company}` : 'Not today'}
              </Text>
            )}
            <Text style={styles.reviewLine}>Notes: {notes || 'None'}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <SecondaryButton label="Back" onPress={handleBack} />
        {isReview ? (
          <PrimaryButton label="Save & start my day" onPress={handleFinish} loading={submitting} />
        ) : (
          <PrimaryButton label="Next" onPress={() => handleAnswer(draft)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  stepIndicator: { ...typography.label, color: colors.primary, marginBottom: spacing.xs },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, paddingTop: spacing.sm },
  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  reviewLine: { ...typography.body, color: colors.text },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
