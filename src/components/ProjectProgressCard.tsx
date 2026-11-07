import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDateLabel } from '../planning/time';
import type { ProjectProgress } from '../projects/projectEngine';
import type { Project } from '../projects/types';
import { colorForPriority, colors, radii, shadows, spacing, typography } from './theme';

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * The project's compact progress view — a title, priority/target-date line, and a task
 * completion bar, used as the Projects list row. With `compact={false}` (the Project Detail
 * screen's header) it also shows milestone progress and remaining estimated work. Nothing
 * here derives completion from time logged; progress is purely tasksCompleted/milestonesCompleted
 * counts computed by projects/projectEngine.computeProjectProgress.
 */
export function ProjectProgressCard({
  project,
  progress,
  compact = true,
}: {
  project: Project;
  progress: ProjectProgress;
  compact?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headerLine}>
        <Text style={styles.title} numberOfLines={1}>
          {project.title}
        </Text>
        <Text style={[styles.priority, { color: colorForPriority(project.priority) }]}>{project.priority}</Text>
      </View>
      <Text style={styles.meta}>
        Due {formatDateLabel(project.targetDate)}
        {project.status === 'completed' ? ' · Completed' : project.status === 'archived' ? ' · Archived' : ''}
      </Text>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(progress.taskCompletionRatio * 100)}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {progress.tasksCompleted}/{progress.tasksTotal} task(s) done
        {progress.milestonesTotal > 0 ? ` · ${progress.milestonesCompleted}/${progress.milestonesTotal} milestone(s)` : ''}
      </Text>

      {!compact && (
        <Text style={styles.remaining}>
          {progress.remainingEstimatedMinutes > 0
            ? `${formatMinutes(progress.remainingEstimatedMinutes)} of estimated work remaining`
            : progress.tasksTotal > 0
              ? 'No estimated work remaining on open tasks.'
              : 'No tasks linked yet.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.card,
  },
  headerLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography.bodyStrong, fontSize: 16, color: colors.text, flex: 1, marginRight: spacing.sm },
  priority: { ...typography.label, textTransform: 'uppercase' },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cardSunken,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  progressText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  remaining: { ...typography.caption, color: colors.text, marginTop: spacing.sm, fontWeight: '600' },
});
