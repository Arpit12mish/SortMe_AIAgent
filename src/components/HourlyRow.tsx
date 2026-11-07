import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CHOICE_LABEL, statusForHour, statusLabel, type HourSlot, type HourlyPlanRow } from '../hourly/hourlyEngine';
import type { HourlyCheckInSettings, HourlyEntry } from '../hourly/types';
import type { ISODateTime, Preferences } from '../planning/types';
import { colorForBlockKind, colors, radii, shadows, spacing, typography } from './theme';
import { PressableScale } from './ui';

function minutesLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

const STATUS_COLOR = {
  not_checked_in: colors.primary,
  answered: colors.success,
  skipped: colors.warning,
  sleep: colors.textFaint,
  not_eligible: colors.textFaint,
} as const;

interface HourlyRowProps {
  row: HourlyPlanRow;
  slots: HourSlot[];
  entries: HourlyEntry[];
  settings: HourlyCheckInSettings;
  preferences: Preferences;
  nowIso: ISODateTime;
  focusMinutesForHour: (hour: number) => number;
  onPressHour: (hour: number) => void;
}

export function HourlyRow({ row, slots, entries, settings, preferences, nowIso, focusMinutesForHour, onPressHour }: HourlyRowProps) {
  const accent = row.kind === 'blocks' ? colorForBlockKind(row.blocks[0]?.kind ?? 'buffer') : colors.textFaint;
  const title =
    row.kind === 'sleep' ? 'Sleep' : row.kind === 'free' ? 'Free time' : row.blocks.map((b) => b.title).join(', ');
  const hours = Array.from({ length: row.endHour - row.startHour }, (_, i) => row.startHour + i);

  return (
    <View style={styles.row}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.headerLine}>
          <Text style={styles.time}>
            {minutesLabel(row.startHour)} – {minutesLabel(row.endHour)}
          </Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {row.kind === 'blocks' &&
          row.blocks.map((b) => !!b.reason && <Text key={b.id} style={styles.reason}>{b.reason}</Text>)}

        {row.kind !== 'sleep' && (
          <View style={styles.hoursWrap}>
            {hours.map((hour) => {
              const slot = slots[hour];
              const entry = entries.find((e) => e.hour === hour);
              const status = statusForHour(slot, entry, settings, preferences, nowIso);
              const focusMinutes = focusMinutesForHour(hour);
              // What actually happened (the reported choice) is shown in place of the
              // generic status word once answered, so planned activity (the row above)
              // and what actually happened (this chip) read as two distinct things.
              const actualLabel = entry?.pastChoice ? CHOICE_LABEL[entry.pastChoice] : statusLabel(status);
              const label = `Hour ${minutesLabel(hour)}, ${statusLabel(status)}${entry?.pastChoice ? `, reported: ${actualLabel}` : ''}${entry?.intention ? `, intention: ${entry.intention}` : ''}`;
              return (
                <PressableScale
                  key={hour}
                  onPress={() => onPressHour(hour)}
                  style={[styles.hourChip, { borderColor: STATUS_COLOR[status] }]}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text style={[styles.hourChipTime, { color: STATUS_COLOR[status] }]}>{minutesLabel(hour)}</Text>
                  <Text style={styles.hourChipStatus}>{actualLabel}</Text>
                  {focusMinutes > 0 && <Text style={styles.hourChipFocus}>{focusMinutes}m focused</Text>}
                  {!!entry?.intention && <Text style={styles.hourChipIntention}>→ {entry.intention}</Text>}
                </PressableScale>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  accent: { width: 4 },
  body: { flex: 1, padding: spacing.md },
  headerLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  time: { ...typography.caption, fontWeight: '600', color: colors.textMuted },
  title: { ...typography.bodyStrong, color: colors.text },
  reason: { marginTop: 2, ...typography.caption, color: colors.textMuted },
  hoursWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  hourChip: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.cardSunken,
    minWidth: 72,
  },
  hourChipTime: { ...typography.caption, fontWeight: '700' },
  hourChipStatus: { ...typography.micro, color: colors.textMuted, marginTop: 1 },
  hourChipFocus: { ...typography.micro, color: colors.success, marginTop: 1 },
  hourChipIntention: { ...typography.micro, color: colors.primary, marginTop: 1 },
});
