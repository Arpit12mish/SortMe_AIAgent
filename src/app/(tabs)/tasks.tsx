import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colorForPriority, colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { formatTimeOfDay } from '../../planning/time';
import type { Task } from '../../planning/types';
import { useAppState } from '../../state/AppStateContext';
import { useProjectState } from '../../state/ProjectStateContext';

const STATUS_LABEL: Record<Task['status'], string> = {
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  deferred: 'Deferred',
  completed: 'Completed',
  at_risk: 'At risk',
  delegated: 'Delegated',
};

function TaskRow({ task, projectTitle, onPress }: { task: Task; projectTitle?: string; onPress: () => void }) {
  return (
    <PressableScale style={styles.row} onPress={onPress}>
      <View style={[styles.priorityDot, { backgroundColor: colorForPriority(task.priority) }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{task.title}</Text>
        <Text style={styles.rowSubtitle}>
          {task.estimateMinutes} min · {task.priority} · {task.canMove ? 'movable' : 'fixed once placed'}
          {task.deadline ? ` · due ${formatTimeOfDay(task.deadline)}` : ''}
          {projectTitle ? ` · ${projectTitle}` : ''}
        </Text>
      </View>
      <Text style={styles.statusBadge}>{STATUS_LABEL[task.status]}</Text>
    </PressableScale>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const { tasks } = useAppState();
  const { projects } = useProjectState();
  const projectTitleById = new Map(projects.map((p) => [p.id, p.title]));
  const sorted = [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <PrimaryButton label="+ New task" onPress={() => router.push('/task-new')} />
      </View>
      <View style={styles.projectsLink}>
        <SecondaryButton label="📁 Projects & goals" onPress={() => router.push('/projects')} />
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            projectTitle={item.projectId ? projectTitleById.get(item.projectId) : undefined}
            onPress={() => router.push(`/task-new?id=${item.id}`)}
          />
        )}
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
  title: { ...typography.display, fontSize: 28, color: colors.text },
  projectsLink: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadows.card,
  },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  statusBadge: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
});
