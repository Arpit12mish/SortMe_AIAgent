import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Buttons';
import { colorForPriority, colors, radii, spacing } from '../../components/theme';
import { formatTimeOfDay } from '../../planning/time';
import type { Task } from '../../planning/types';
import { useAppState } from '../../state/AppStateContext';

const STATUS_LABEL: Record<Task['status'], string> = {
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  deferred: 'Deferred',
  completed: 'Completed',
  at_risk: 'At risk',
  delegated: 'Delegated',
};

function TaskRow({ task }: { task: Task }) {
  return (
    <View style={styles.row}>
      <View style={[styles.priorityDot, { backgroundColor: colorForPriority(task.priority) }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{task.title}</Text>
        <Text style={styles.rowSubtitle}>
          {task.estimateMinutes} min · {task.priority} · {task.canMove ? 'movable' : 'fixed once placed'}
          {task.deadline ? ` · due ${formatTimeOfDay(task.deadline)}` : ''}
        </Text>
      </View>
      <Text style={styles.statusBadge}>{STATUS_LABEL[task.status]}</Text>
    </View>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const { tasks } = useAppState();
  const sorted = [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <PrimaryButton label="+ New task" onPress={() => router.push('/task-new')} />
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <TaskRow task={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tasks yet. Add one to get started.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
