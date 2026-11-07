import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryButton } from '../../components/Buttons';
import { HourlyRow } from '../../components/HourlyRow';
import { colors, radii, spacing, typography } from '../../components/theme';
import { actualFocusMinutesForHour, buildHourlyGrid, groupHourlyGrid, unansweredPastHours } from '../../hourly/hourlyEngine';
import { useHourlyCheckIns } from '../../state/HourlyStateContext';
import { formatDateLabel } from '../../planning/time';
import { useAppState } from '../../state/AppStateContext';
import { useFocusSessions } from '../../state/FocusSessionContext';
import { useReminders } from '../../state/ReminderStateContext';

export default function HourlyPlanScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { activeDate, preferences, planForDate } = useAppState();
  const { sessions } = useFocusSessions();
  const { settings, entries } = useHourlyCheckIns();
  const { syncHourlyCheckInReminders } = useReminders();
  const { current } = planForDate(date);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const slots = useMemo(() => (preferences ? buildHourlyGrid(date, current, preferences) : []), [date, current, preferences]);
  const rows = useMemo(() => groupHourlyGrid(slots), [slots]);
  const dateEntries = useMemo(() => entries.filter((e) => e.date === date), [entries, date]);

  const catchUpHours = useMemo(
    () => (preferences ? unansweredPastHours(date, slots, dateEntries, settings, preferences, nowIso) : []),
    [date, slots, dateEntries, settings, preferences, nowIso]
  );

  const focusMinutesForHour = useMemo(() => {
    return (hour: number) => {
      const slot = slots[hour];
      if (!slot) return 0;
      const relevantSessions = sessions.filter((s) => s.startedAt < slot.endIso && (s.endedAt ?? nowIso) > slot.startIso);
      return Math.round(actualFocusMinutesForHour(relevantSessions, { start: slot.startIso, end: slot.endIso }, nowIso));
    };
  }, [slots, sessions, nowIso]);

  // Reminders stay in sync with this date's accepted plan, settings, and
  // responses the same way focus-block/habit reminders do elsewhere — unchanged
  // ones are left alone (reminderEngine.diffReminders), so this never produces
  // duplicate prompts just from revisiting the screen or saving a check-in.
  useEffect(() => {
    if (!preferences) return;
    syncHourlyCheckInReminders(date, slots, settings, preferences, dateEntries);
  }, [date, slots, settings, preferences, dateEntries, syncHourlyCheckInReminders]);

  if (!preferences) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {formatDateLabel(date)}
          {date === activeDate ? ' · Today' : ''}
        </Text>
        <Text style={styles.subtitle}>Every hour of the day, derived from your accepted plan.</Text>

        <SecondaryButton label="🗓️ Tell SortMe about my day" onPress={() => router.push('/daily-briefing')} />

        {!current && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No accepted plan for this date yet.</Text>
          </View>
        )}

        {catchUpHours.length > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {catchUpHours.length} hour{catchUpHours.length > 1 ? 's' : ''} from earlier today still need a check-in.
            </Text>
            <SecondaryButton
              label="Catch up now"
              onPress={() => router.push(`/hourly-checkin?date=${date}&hour=${catchUpHours[0]}`)}
            />
          </View>
        )}

        {rows.map((row) => (
          <HourlyRow
            key={row.startHour}
            row={row}
            slots={slots}
            entries={dateEntries}
            settings={settings}
            preferences={preferences}
            nowIso={nowIso}
            focusMinutesForHour={focusMinutesForHour}
            onPressHour={(hour) => router.push(`/hourly-checkin?date=${date}&hour=${hour}`)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  banner: {
    backgroundColor: colors.tintPrimary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bannerText: { color: colors.text, ...typography.bodyStrong, fontSize: 14 },
});
