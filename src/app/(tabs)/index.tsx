import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton, PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { HabitTodayRow } from '../../components/HabitTodayRow';
import { PlanBlockRow } from '../../components/PlanBlockRow';
import { colors, glow, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { hasCheckedInMorning, hasReviewedEvening, todayLocalDate } from '../../checkins/checkinEngine';
import { HABIT_CYCLE, deriveHabitDayStatus, habitsScheduledForDate } from '../../habits/habitEngine';
import { buildHourlyGrid, unansweredPastHours } from '../../hourly/hourlyEngine';
import { addDaysToISODate } from '../../planning/time';
import type { PlanBlock } from '../../planning/types';
import type { DailySuggestionKind } from '../../suggestions/types';
import { useCareerInsights } from '../../suggestions/useCareerInsights';
import { useDailySuggestions } from '../../suggestions/useDailySuggestions';
import { useAppState } from '../../state/AppStateContext';
import { useCheckIns } from '../../state/CheckInContext';
import { useFocusSessions } from '../../state/FocusSessionContext';
import { useHabitState } from '../../state/HabitStateContext';
import { useHourlyCheckIns } from '../../state/HourlyStateContext';
import { useReminders } from '../../state/ReminderStateContext';

const SUGGESTION_LABEL: Record<DailySuggestionKind, string> = {
  interview_followup: 'Follow up',
  email_reply: 'Reply',
  revise_interview_note: 'Revise',
  revise_topic: 'Revise',
};

function TaskBlockActions({ block }: { block: PlanBlock }) {
  const router = useRouter();
  const { tasks } = useAppState();
  const { activeSession, start } = useFocusSessions();
  const [starting, setStarting] = useState(false);
  const task = tasks.find((t) => t.id === block.taskId);
  if (!task) return null;

  const isThisBlockActive = activeSession?.taskId === task.id;
  if (isThisBlockActive) {
    return (
      <View style={styles.blockActions}>
        <SecondaryButton
          label={activeSession?.status === 'paused' ? 'Session paused — open' : 'Session in progress — open'}
          onPress={() => router.push('/session')}
        />
      </View>
    );
  }
  if (activeSession) return null; // another session is active; don't offer to start a second one

  const handleStart = async () => {
    setStarting(true);
    try {
      await start(task, block.id);
      router.push('/session');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.blockActions}>
      <SecondaryButton label="Start focus session" onPress={handleStart} disabled={starting} />
    </View>
  );
}

const WEEK_WINDOW_DAYS = 7;

export default function TodayScreen() {
  const router = useRouter();
  const {
    activeDate,
    currentPlan,
    proposedPlan,
    preferences,
    planForDate,
    generateInitialPlan,
    reportDelay,
    reportEnergyChanged,
    loading,
  } = useAppState();
  const { morningCheckIns, eveningReviews, loading: checkInsLoading } = useCheckIns();
  const { habits, checkIns: habitCheckIns, saveCheckIn, clearCheckIn } = useHabitState();
  const { enabled: remindersEnabled, syncFocusBlockReminders, syncCheckInReminders, syncHabitReminders, syncHourlyCheckInReminders } =
    useReminders();
  const { settings: hourlySettings, entries: hourlyEntries } = useHourlyCheckIns();
  const { suggestions: dailySuggestions, loading: suggestionsLoading, refresh: refreshSuggestions } = useDailySuggestions();
  const { insights: careerInsights, loading: careerInsightsLoading, refresh: refreshCareerInsights } = useCareerInsights();
  const [showDelayOptions, setShowDelayOptions] = useState(false);
  const [working, setWorking] = useState(false);

  const today = useMemo(() => todayLocalDate(), []);
  const morningDone = hasCheckedInMorning(morningCheckIns, today);
  const eveningDone = hasReviewedEvening(eveningReviews, today);
  const todaysHabits = useMemo(() => habitsScheduledForDate(habits, today), [habits, today]);

  // Opens the morning wizard once per app session on the first day it
  // hasn't been done yet -- ref-guarded so it never re-fires just because
  // morningCheckIns/today re-render, only the very first time this screen
  // sees "not done today" after mounting.
  const autoLaunchedRef = useRef(false);
  useEffect(() => {
    if (autoLaunchedRef.current || loading || checkInsLoading) return;
    if (!morningDone) {
      autoLaunchedRef.current = true;
      router.push('/checkin-morning');
    }
  }, [loading, checkInsLoading, morningDone, router]);

  // Other days can now also end up with a pending review (a preferences edit or task edit
  // can affect a future accepted date, not just today) — surfaced here so it's never silently
  // invisible from Today, without duplicating the week screen's own per-day detail.
  const otherDatesNeedingReview = useMemo(() => {
    let count = 0;
    for (let i = 1; i < WEEK_WINDOW_DAYS; i++) {
      const date = addDaysToISODate(activeDate, i);
      if (planForDate(date).proposed) count += 1;
    }
    return count;
  }, [activeDate, planForDate]);

  // Reminders stay in sync with the accepted plan automatically: whenever it
  // changes (initial generation, an accepted replan) the focus-block
  // reminders are rescheduled to match, with unchanged ones left alone (see
  // reminderEngine.diffReminders) so this never produces duplicate alerts.
  useEffect(() => {
    if (remindersEnabled && currentPlan) syncFocusBlockReminders(currentPlan);
  }, [remindersEnabled, currentPlan, syncFocusBlockReminders]);

  useEffect(() => {
    if (remindersEnabled) syncCheckInReminders();
  }, [remindersEnabled, today, syncCheckInReminders]);

  useEffect(() => {
    if (remindersEnabled) syncHabitReminders(habits, habitCheckIns);
  }, [remindersEnabled, habits, habitCheckIns, syncHabitReminders]);

  // Hourly check-in reminders have their own on/off switch (HourlyCheckInSettings.enabled),
  // independent of the general reminders toggle above, so this isn't gated by remindersEnabled —
  // desiredHourlyCheckInReminders already returns nothing (and applyDiff cancels any stale
  // ones) when hourlySettings.enabled is false.
  const todaysHourlySlots = useMemo(
    () => (preferences ? buildHourlyGrid(today, currentPlan, preferences) : []),
    [today, currentPlan, preferences]
  );
  const todaysHourlyEntries = useMemo(() => hourlyEntries.filter((e) => e.date === today), [hourlyEntries, today]);

  useEffect(() => {
    if (!preferences) return;
    syncHourlyCheckInReminders(today, todaysHourlySlots, hourlySettings, preferences, todaysHourlyEntries);
  }, [today, todaysHourlySlots, hourlySettings, preferences, todaysHourlyEntries, syncHourlyCheckInReminders]);

  // Reopening the app (not just visiting the Hourly Plan screen) is exactly
  // when a past unanswered hour should resurface, since JS timers don't fire
  // reliably while the app was backgrounded or killed — this is the catch-up
  // surface the spec calls for, independent of whatever reminders did or
  // didn't fire while the app was closed.
  const catchUpHours = useMemo(
    () =>
      preferences && hourlySettings.enabled
        ? unansweredPastHours(today, todaysHourlySlots, todaysHourlyEntries, hourlySettings, preferences, new Date().toISOString())
        : [],
    [preferences, hourlySettings, today, todaysHourlySlots, todaysHourlyEntries]
  );

  // Independent of Task/PlanBlock by construction — a habit and a plan task
  // share no identifier, so marking a task complete can never reach a
  // HabitCheckIn, and cycling a habit here can never touch a Task.
  const handleHabitCycle = async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    const status = deriveHabitDayStatus(habit, habitCheckIns, today, today);
    const next = HABIT_CYCLE[status];
    if (next === 'untracked') await clearCheckIn(habitId, today);
    else await saveCheckIn(habitId, today, next);
  };

  const handleGenerate = async () => {
    setWorking(true);
    try {
      await generateInitialPlan();
      router.push('/replan-review');
    } finally {
      setWorking(false);
    }
  };

  const handleDelay = async (minutes: number) => {
    setShowDelayOptions(false);
    setWorking(true);
    try {
      await reportDelay(undefined, minutes);
      router.push('/replan-review');
    } finally {
      setWorking(false);
    }
  };

  const handleLowEnergy = async () => {
    setWorking(true);
    try {
      await reportEnergyChanged('low');
      router.push('/replan-review');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Today</Text>

        <PressableScale style={styles.captureCard} onPress={() => router.push('/capture')} scaleTo={0.97}>
          <View style={styles.captureIcon}>
            <Text style={styles.captureIconGlyph}>🎤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.captureTitle}>What&apos;s on your mind?</Text>
            <Text style={styles.captureSubtitle}>Talk through a task, interview, your mood, or notes to revise</Text>
          </View>
        </PressableScale>

        <PressableScale style={styles.captureCard} onPress={() => router.push('/daily-briefing')} scaleTo={0.97}>
          <View style={[styles.captureIcon, { backgroundColor: colors.success }]}>
            <Text style={styles.captureIconGlyph}>🗓️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.captureTitle}>Tell SortMe about my day</Text>
            <Text style={styles.captureSubtitle}>Talk through tomorrow and let SortMe propose tasks and plan around it</Text>
          </View>
        </PressableScale>

        {dailySuggestions.length > 0 && (
          <View style={styles.suggestionsCard}>
            <View style={styles.suggestionsHeader}>
              <Text style={styles.sectionLabel}>Suggestions for today</Text>
              <GhostButton label={suggestionsLoading ? 'Refreshing…' : 'Refresh'} onPress={refreshSuggestions} disabled={suggestionsLoading} />
            </View>
            {dailySuggestions.map((s) => (
              <PressableScale key={s.id} style={styles.suggestionRow} onPress={() => router.push(s.route)}>
                <View style={styles.suggestionKindTag}>
                  <Text style={styles.suggestionKindText}>{SUGGESTION_LABEL[s.kind]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle}>{s.title}</Text>
                  <Text style={styles.suggestionSubtitle}>{s.subtitle}</Text>
                </View>
              </PressableScale>
            ))}
          </View>
        )}

        <View style={styles.checkinRow}>
          <SecondaryButton
            label={morningDone ? '✓ Morning check-in' : 'Morning check-in'}
            onPress={() => router.push('/checkin-morning')}
          />
          <SecondaryButton
            label={eveningDone ? '✓ Evening review' : 'Evening review'}
            onPress={() => router.push('/checkin-evening')}
          />
        </View>

        {todaysHabits.length > 0 && (
          <View style={styles.habitsSection}>
            <Text style={styles.sectionLabel}>Today&apos;s habits</Text>
            {todaysHabits.map((h) => (
              <HabitTodayRow
                key={h.id}
                habit={h}
                status={deriveHabitDayStatus(h, habitCheckIns, today, today)}
                onPress={() => handleHabitCycle(h.id)}
              />
            ))}
          </View>
        )}

        {proposedPlan && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>You have a revised plan waiting for review.</Text>
            <SecondaryButton label="Review now" onPress={() => router.push('/replan-review')} />
          </View>
        )}

        {catchUpHours.length > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {catchUpHours.length} hour{catchUpHours.length > 1 ? 's' : ''} from earlier today still need a check-in.
            </Text>
            <SecondaryButton
              label="Catch up now"
              onPress={() => router.push(`/hourly-checkin?date=${today}&hour=${catchUpHours[0]}`)}
            />
          </View>
        )}

        {!currentPlan && !proposedPlan && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No plan yet for today</Text>
            <Text style={styles.emptyBody}>
              Generate a plan from your fixed commitments, meals, and tasks.
            </Text>
            <PrimaryButton label="Generate today's plan" onPress={handleGenerate} loading={working} />
            <SecondaryButton
              label={`View week${otherDatesNeedingReview > 0 ? ` — ${otherDatesNeedingReview} need review` : ''}`}
              onPress={() => router.push('/week')}
            />
          </View>
        )}

        {currentPlan && (
          <>
            <Text style={styles.sectionLabel}>Plan v{currentPlan.version} · Accepted</Text>
            {currentPlan.blocks.map((block) => (
              <View key={block.id}>
                <PlanBlockRow block={block} />
                {block.kind === 'task' && <TaskBlockActions block={block} />}
              </View>
            ))}

            {currentPlan.unscheduledTasks.length > 0 && (
              <View style={styles.flagSection}>
                <Text style={styles.flagTitle}>Unscheduled</Text>
                {currentPlan.unscheduledTasks.map((t) => (
                  <Text key={t.taskId} style={styles.flagRow}>
                    • {t.title} — {t.reason}
                  </Text>
                ))}
              </View>
            )}

            {currentPlan.atRiskTasks.length > 0 && (
              <View style={[styles.flagSection, styles.riskSection]}>
                <Text style={[styles.flagTitle, { color: colors.danger }]}>At risk</Text>
                {currentPlan.atRiskTasks.map((t) => (
                  <Text key={t.taskId} style={styles.flagRow}>
                    • {t.title} — {t.reason}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.actions}>
              <PrimaryButton
                label="Add urgent task"
                onPress={() => router.push({ pathname: '/task-new', params: { urgent: '1' } })}
              />
              <SecondaryButton label="View hourly plan" onPress={() => router.push(`/hourly/${today}`)} />
              {showDelayOptions ? (
                <View style={styles.delayRow}>
                  {[15, 30, 45, 60].map((m) => (
                    <SecondaryButton key={m} label={`${m}m`} onPress={() => handleDelay(m)} />
                  ))}
                </View>
              ) : (
                <SecondaryButton label="Report a delay" onPress={() => setShowDelayOptions(true)} />
              )}
              <SecondaryButton label="Less energy today" onPress={handleLowEnergy} disabled={working} />
              <SecondaryButton
                label={`View week${otherDatesNeedingReview > 0 ? ` — ${otherDatesNeedingReview} need review` : ''}`}
                onPress={() => router.push('/week')}
              />
              <SecondaryButton label="View plan history" onPress={() => router.push('/history')} />
              <SecondaryButton label="Session history" onPress={() => router.push('/session-history')} />
              <SecondaryButton label="Weekly review" onPress={() => router.push('/weekly-review')} />
            </View>
          </>
        )}

        {careerInsights.length > 0 && (
          <View style={styles.careerCard}>
            <View style={styles.suggestionsHeader}>
              <Text style={styles.sectionLabel}>This week&apos;s opportunity</Text>
              <GhostButton label={careerInsightsLoading ? 'Refreshing…' : 'Refresh'} onPress={refreshCareerInsights} disabled={careerInsightsLoading} />
            </View>
            {careerInsights.map((insight, i) => (
              <View key={i} style={styles.careerInsightRow}>
                <Text style={styles.careerHeadline}>{insight.headline}</Text>
                <Text style={styles.careerSignal}>{insight.signal}</Text>
                <Text style={styles.careerAction}>→ {insight.suggestedAction}</Text>
              </View>
            ))}
            <Text style={styles.careerDisclaimer}>
              AI-researched from current web sources — verify before acting on big decisions.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.display, fontSize: 28, color: colors.text, marginBottom: spacing.md },
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  captureIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow(colors.primary),
  },
  captureIconGlyph: { fontSize: 22 },
  captureTitle: { ...typography.bodyStrong, color: colors.text },
  captureSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  suggestionsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  suggestionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  suggestionKindTag: {
    backgroundColor: colors.tintPrimary,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  suggestionKindText: { ...typography.caption, fontSize: 11, color: colors.primary, fontWeight: '700' },
  suggestionTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  suggestionSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  careerCard: {
    backgroundColor: colors.cardElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  careerInsightRow: { gap: 2, paddingVertical: spacing.xs },
  careerHeadline: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  careerSignal: { ...typography.caption, color: colors.textMuted },
  careerAction: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  careerDisclaimer: { ...typography.caption, fontSize: 11, color: colors.textFaint, fontStyle: 'italic', marginTop: spacing.xs },
  checkinRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  habitsSection: { marginBottom: spacing.md },
  blockActions: { marginTop: -spacing.xs, marginBottom: spacing.sm },
  sectionLabel: { ...typography.label, color: colors.textFaint, marginBottom: spacing.sm },
  banner: {
    backgroundColor: colors.tintPrimary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bannerText: { color: colors.text, ...typography.bodyStrong, fontSize: 14 },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  flagSection: {
    backgroundColor: colors.tintWarning,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  riskSection: { backgroundColor: colors.tintDanger },
  flagTitle: { fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  flagRow: { ...typography.caption, color: colors.text, marginBottom: 2 },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  delayRow: { flexDirection: 'row', gap: spacing.sm },
});
