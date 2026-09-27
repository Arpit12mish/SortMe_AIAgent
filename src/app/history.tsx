import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlanBlockRow } from '../components/PlanBlockRow';
import { colors, radii, spacing } from '../components/theme';
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
    default:
      return 'Replan';
  }
}

export default function HistoryScreen() {
  const { planVersions } = useAppState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = [...planVersions].sort((a, b) => b.version - a.version);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FlatList
        data={sorted}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          return (
            <Pressable style={styles.card} onPress={() => setExpandedId(expanded ? null : item.id)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  v{item.version} · {eventSummary(item)}
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
            </Pressable>
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
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  badge: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cardSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  expanded: { marginTop: spacing.md },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
