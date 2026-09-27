import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatTimeOfDay } from '../planning/time';
import type { PlanBlock } from '../planning/types';
import { colorForBlockKind, colors, radii, spacing } from './theme';

const KIND_LABEL: Record<PlanBlock['kind'], string> = {
  fixed: 'Fixed',
  meal: 'Meal',
  task: 'Task',
  break: 'Break',
  buffer: 'Buffer',
};

export function PlanBlockRow({ block }: { block: PlanBlock }) {
  const accent = colorForBlockKind(block.kind);
  return (
    <View style={styles.row}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.headerLine}>
          <Text style={styles.time}>
            {formatTimeOfDay(block.start)} – {formatTimeOfDay(block.end)}
          </Text>
          <Text style={[styles.kind, { color: accent }]}>{KIND_LABEL[block.kind]}</Text>
        </View>
        <Text style={styles.title}>{block.title}</Text>
        {!!block.reason && <Text style={styles.reason}>{block.reason}</Text>}
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
  },
  accent: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: spacing.md,
  },
  headerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  time: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  kind: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  reason: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
});
