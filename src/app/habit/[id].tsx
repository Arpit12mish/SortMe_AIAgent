import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayLocalDate } from '../../checkins/checkinEngine';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { HabitDayCell } from '../../components/HabitDayCell';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import {
  HABIT_CYCLE,
  computeStreaks,
  completionRateForPeriod,
  deriveHabitDayStatus,
  isScheduledOn,
  monthGridDates,
} from '../../habits/habitEngine';
import { dayOfWeek, toISODate } from '../../planning/time';
import { useHabitState } from '../../state/HabitStateContext';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: 'Last 30 days' },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

function isoWithOffset(date: string, offsetDays: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return toISODate(new Date(year, (month ?? 1) - 1, day + offsetDays));
}

function periodRange(key: PeriodKey, today: string): { start: string; end: string } {
  if (key === 'week') return { start: isoWithOffset(today, -dayOfWeek(today)), end: today };
  if (key === 'month') {
    const [year, month] = today.split('-');
    return { start: `${year}-${month}-01`, end: today };
  }
  return { start: isoWithOffset(today, -29), end: today };
}

export default function HabitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { habits, checkIns, loading, correctCheckIn, clearCheckIn, archiveHabit } = useHabitState();
  const today = useMemo(() => todayLocalDate(), []);
  const habit = useMemo(() => habits.find((h) => h.id === id), [habits, id]);

  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const [viewYear, setViewYear] = useState(() => Number(today.split('-')[0]));
  const [viewMonth, setViewMonth] = useState(() => Number(today.split('-')[1]));

  const streaks = useMemo(() => (habit ? computeStreaks(habit, checkIns, today) : { current: 0, longest: 0 }), [habit, checkIns, today]);
  const range = useMemo(() => periodRange(periodKey, today), [periodKey, today]);
  const periodStats = useMemo(
    () => (habit ? completionRateForPeriod(habit, checkIns, range.start, range.end, today) : null),
    [habit, checkIns, range, today]
  );
  const gridCells = useMemo(() => monthGridDates(viewYear, viewMonth), [viewYear, viewMonth]);

  if (loading) return null;
  if (!habit) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.content}>
          <Text style={styles.notFound}>Habit not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleCellPress = async (date: string) => {
    const status = deriveHabitDayStatus(habit, checkIns, date, today);
    const next = HABIT_CYCLE[status];
    if (next === 'untracked') {
      await clearCheckIn(habit.id, date);
    } else {
      await correctCheckIn(habit.id, date, next);
    }
  };

  const handleArchive = () => {
    Alert.alert('Archive habit', `Archive "${habit.name}"? Its history stays visible under Archived.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          await archiveHabit(habit.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{habit.name}</Text>
        {!!habit.goal && <Text style={styles.goal}>{habit.goal}</Text>}
        {habit.archived && <Text style={styles.archivedNote}>Archived</Text>}

        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <PressableScale
              key={p.key}
              onPress={() => setPeriodKey(p.key)}
              scaleTo={0.93}
              style={[styles.periodChip, periodKey === p.key && styles.periodChipSelected]}
            >
              <Text style={[styles.periodChipText, periodKey === p.key && styles.periodChipTextSelected]}>{p.label}</Text>
            </PressableScale>
          ))}
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{streaks.current}</Text>
            <Text style={styles.statLabel}>Current streak</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{streaks.longest}</Text>
            <Text style={styles.statLabel}>Longest streak</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{periodStats?.completedDays ?? 0}</Text>
            <Text style={styles.statLabel}>Completed days</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{Math.round((periodStats?.completionRate ?? 0) * 100)}%</Text>
            <Text style={styles.statLabel}>Completion rate</Text>
          </View>
        </View>

        <View style={styles.monthHeader}>
          <Pressable onPress={goPrevMonth} accessibilityLabel="Previous month" hitSlop={8}>
            <Text style={styles.monthNav}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </Text>
          <Pressable onPress={goNextMonth} accessibilityLabel="Next month" hitSlop={8}>
            <Text style={styles.monthNav}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekDayRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={i} style={styles.weekDayLabel}>{d}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {gridCells.map((cell) => {
            const scheduled = isScheduledOn(habit, cell.date);
            const status = deriveHabitDayStatus(habit, checkIns, cell.date, today);
            const interactive = cell.inMonth && scheduled && cell.date <= today;
            return (
              <View key={cell.date} style={styles.gridCellWrap}>
                <HabitDayCell
                  date={cell.date}
                  status={status}
                  scheduled={scheduled}
                  interactive={interactive}
                  dimmed={!cell.inMonth}
                  onPress={() => handleCellPress(cell.date)}
                  size={40}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <SecondaryButton label="Edit habit" onPress={() => router.push(`/habit-new?id=${habit.id}`)} />
          {!habit.archived && <PrimaryButton label="Archive habit" onPress={handleArchive} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  notFound: { ...typography.body, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  goal: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  archivedNote: { ...typography.label, color: colors.warning, marginTop: spacing.xs },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  periodChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  periodChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { ...typography.caption, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  periodChipTextSelected: { color: colors.primaryText },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  statTile: {
    flexBasis: '47%',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.primary },
  statLabel: { ...typography.micro, color: colors.textMuted, marginTop: 4 },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  monthNav: { fontSize: 22, color: colors.primary, paddingHorizontal: spacing.md },
  monthLabel: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  weekDayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  weekDayLabel: { width: 40, textAlign: 'center', ...typography.label, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCellWrap: { width: `${100 / 7}%`, alignItems: 'center', marginBottom: spacing.xs },
  footer: { marginTop: spacing.xl, gap: spacing.sm },
});
