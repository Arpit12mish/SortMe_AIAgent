import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayLocalDate } from '../../checkins/checkinEngine';
import { HabitDayCell } from '../../components/HabitDayCell';
import { colors, glow, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { deriveHabitDayStatus, isScheduledOn, recentActivityDates } from '../../habits/habitEngine';
import { useHabitState } from '../../state/HabitStateContext';

const RECENT_DAYS = 14;

export default function HabitsScreen() {
  const router = useRouter();
  const { habits, checkIns, reorderHabits, loading } = useHabitState();
  const [showArchived, setShowArchived] = useState(false);
  const today = useMemo(() => todayLocalDate(), []);

  const active = useMemo(() => habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archived), [habits]);
  const recentDates = useMemo(() => recentActivityDates(today, RECENT_DAYS), [today]);

  const move = (habitId: string, direction: -1 | 1) => {
    const ids = active.map((h) => h.id);
    const index = ids.indexOf(habitId);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    reorderHabits(ids);
  };

  if (loading) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Habits</Text>
        <Text style={styles.helper}>Recurring habits, tracked day by day in your local time.</Text>

        <PressableScale style={styles.newButton} onPress={() => router.push('/habit-new')}>
          <Text style={styles.newButtonText}>+ New habit</Text>
        </PressableScale>

        {active.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>No habits yet. Add one to start tracking.</Text>
          </View>
        )}

        {active.map((habit, index) => (
          <PressableScale key={habit.id} style={styles.card} onPress={() => router.push(`/habit/${habit.id}`)}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>{habit.name}</Text>
                {!!habit.goal && <Text style={styles.cardGoal}>{habit.goal}</Text>}
              </View>
              <View style={styles.reorderColumn}>
                <Pressable
                  onPress={() => move(habit.id, -1)}
                  disabled={index === 0}
                  accessibilityLabel={`Move ${habit.name} up`}
                  hitSlop={8}
                >
                  <Text style={[styles.reorderArrow, index === 0 && styles.reorderArrowDisabled]}>▲</Text>
                </Pressable>
                <Pressable
                  onPress={() => move(habit.id, 1)}
                  disabled={index === active.length - 1}
                  accessibilityLabel={`Move ${habit.name} down`}
                  hitSlop={8}
                >
                  <Text style={[styles.reorderArrow, index === active.length - 1 && styles.reorderArrowDisabled]}>▼</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.strip}>
              {recentDates.map((date) => (
                <HabitDayCell
                  key={date}
                  date={date}
                  status={deriveHabitDayStatus(habit, checkIns, date, today)}
                  scheduled={isScheduledOn(habit, date)}
                  interactive={false}
                  showDayNumber={false}
                  size={16}
                />
              ))}
            </View>
          </PressableScale>
        ))}

        {archived.length > 0 && (
          <>
            <Pressable onPress={() => setShowArchived((v) => !v)} style={styles.archivedToggle}>
              <Text style={styles.archivedToggleText}>
                {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
              </Text>
            </Pressable>
            {showArchived &&
              archived.map((habit) => (
                <PressableScale
                  key={habit.id}
                  style={[styles.card, styles.archivedCard]}
                  onPress={() => router.push(`/habit/${habit.id}`)}
                >
                  <Text style={styles.cardTitle}>{habit.name}</Text>
                  <Text style={styles.cardGoal}>Archived</Text>
                </PressableScale>
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.display, fontSize: 28, color: colors.text },
  helper: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  newButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...glow(colors.primary),
  },
  newButtonText: { color: colors.primaryText, ...typography.bodyStrong },
  emptyState: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg },
  emptyBody: { ...typography.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  archivedCard: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardHeaderText: { flex: 1 },
  cardTitle: { ...typography.heading, fontSize: 17, color: colors.text },
  cardGoal: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  reorderColumn: { alignItems: 'center', gap: 2, marginLeft: spacing.sm },
  reorderArrow: { fontSize: 14, color: colors.primary, padding: 4 },
  reorderArrowDisabled: { color: colors.border },
  strip: { flexDirection: 'row', gap: 3, marginTop: spacing.sm, flexWrap: 'wrap' },
  archivedToggle: { marginTop: spacing.sm, marginBottom: spacing.sm },
  archivedToggleText: { ...typography.caption, fontWeight: '600', color: colors.primary },
});
