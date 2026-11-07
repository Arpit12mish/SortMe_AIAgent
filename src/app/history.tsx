import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlanBlockRow } from '../components/PlanBlockRow';
import { colors, radii, shadows, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { formatDateLabel } from '../planning/time';
import type { PlanVersion } from '../planning/types';
import { useAppState } from '../state/AppStateContext';

const STATUS_COLOR: Record<PlanVersion['status'], string> = {
  accepted: colors.success,
  proposed: colors.warning,
  discarded: colors.textMuted,
};

function eventSummary(plan: PlanVersion): string {
  if (!plan.triggeredBy) return 'Initial plan';
  switch (plan.triggeredBy.type) {
    case 'new_task':
      return 'Urgent task added';
    case 'late_start':
      return `Delay reported (${plan.triggeredBy.delayMinutes}m)`;
    case 'event_changed':
      return plan.triggeredBy.description;
    case 'energy_changed':
      return `Energy changed (${plan.triggeredBy.level})`;
    case 'preferences_changed':
      return plan.triggeredBy.summary;
    case 'task_edited':
      return plan.triggeredBy.summary;
    default:
      return 'Replan';
  }
}

export default function HistoryScreen() {
  const { planVersions } = useAppState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Version numbers are per-date, not global (a fresh date starts its own history at v1), so
  // two different dates' entries can share a version number — sort chronologically instead,
  // which stays correct across dates.
  const sorted = [...planVersions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FlatList
        data={sorted}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          return (
            <PressableScale style={styles.card} onPress={() => setExpandedId(expanded ? null : item.id)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {formatDateLabel(item.date)} · v{item.version} · {eventSummary(item)}
                </Text>
                <Text style={[styles.badge, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                {new Date(item.createdAt).toLocaleString()} · {item.changes.length} change(s)
              </Text>
              {expanded && (
                <View style={styles.expanded}>
                  {item.blocks.map((b) => (
                    <PlanBlockRow key={b.id} block={b} />
                  ))}
                </View>
              )}
            </PressableScale>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No plan history yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { ...typography.bodyStrong, fontSize: 15, color: colors.text },
  badge: { ...typography.label, textTransform: 'uppercase' },
  cardSubtitle: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  expanded: { marginTop: spacing.md },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
