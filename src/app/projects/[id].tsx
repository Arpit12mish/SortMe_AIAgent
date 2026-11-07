import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton, GhostButton, PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { DateField, isValidDate } from '../../components/DateField';
import { formatMinutes, ProjectProgressCard } from '../../components/ProjectProgressCard';
import { formatDateLabel } from '../../planning/time';
import type { Task } from '../../planning/types';
import { computeProjectProgress, tasksForMilestone, unassignedProjectTasks, upcomingDeadlines } from '../../projects/projectEngine';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { useAppState } from '../../state/AppStateContext';
import { useFocusSessions } from '../../state/FocusSessionContext';
import { useProjectState } from '../../state/ProjectStateContext';

function TaskRow({ task, onUnlink }: { task: Task; onUnlink: () => void }) {
  return (
    <View style={styles.taskRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.taskMeta}>
          {task.estimateMinutes} min · {task.priority}
          {task.status === 'completed' ? ' · Completed' : ''}
        </Text>
      </View>
      <GhostButton label="Unlink" onPress={onUnlink} tone="danger" />
    </View>
  );
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    projects,
    milestones,
    updateProject,
    markProjectCompleted,
    addMilestone,
    markMilestoneCompleted,
    reopenMilestone,
    removeMilestone,
    capacityForProject,
  } = useProjectState();
  const { tasks, updateTask } = useAppState();
  const { sessions } = useFocusSessions();

  const [editingDeadline, setEditingDeadline] = useState(false);
  const [draftTargetDate, setDraftTargetDate] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [linkPickerFor, setLinkPickerFor] = useState<string | 'project' | null>(null);

  const project = projects.find((p) => p.id === id);
  const projectMilestones = useMemo(
    () => milestones.filter((m) => m.projectId === id).sort((a, b) => a.order - b.order),
    [milestones, id]
  );
  const progress = useMemo(() => computeProjectProgress(id, milestones, tasks, sessions), [id, milestones, tasks, sessions]);
  const deadlines = useMemo(() => upcomingDeadlines(id, milestones, tasks), [id, milestones, tasks]);
  const capacity = useMemo(() => capacityForProject(id), [capacityForProject, id]);
  const unassigned = useMemo(() => unassignedProjectTasks(tasks, id), [tasks, id]);
  const linkableTasks = useMemo(
    () => tasks.filter((t) => !t.projectId && t.status !== 'completed' && t.status !== 'delegated'),
    [tasks]
  );

  if (!project) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Project not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const linkTask = (taskId: string, milestoneId?: string) => {
    updateTask(taskId, { projectId: project.id, milestoneId });
    setLinkPickerFor(null);
  };
  const unlinkTask = (taskId: string) => {
    updateTask(taskId, { projectId: undefined, milestoneId: undefined });
  };

  const saveDeadline = async () => {
    if (!isValidDate(draftTargetDate)) return;
    await updateProject(project.id, { targetDate: draftTargetDate });
    setEditingDeadline(false);
  };

  const handleAddMilestone = async () => {
    if (newMilestoneTitle.trim().length === 0 || !isValidDate(newMilestoneDate)) return;
    await addMilestone({ projectId: project.id, title: newMilestoneTitle.trim(), targetDate: newMilestoneDate });
    setNewMilestoneTitle('');
    setNewMilestoneDate('');
  };

  const confirmMarkComplete = () => {
    Alert.alert('Mark project complete', `Mark "${project.title}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark complete', onPress: () => markProjectCompleted(project.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ProjectProgressCard project={project} progress={progress} compact={false} />
        {project.description ? <Text style={styles.description}>{project.description}</Text> : null}

        <View style={styles.sectionRow}>
          {editingDeadline ? (
            <View style={{ flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
              <DateField label="Target date" value={draftTargetDate} onChange={setDraftTargetDate} />
              <SecondaryButton label="Save" onPress={saveDeadline} disabled={!isValidDate(draftTargetDate)} />
            </View>
          ) : (
            <SecondaryButton
              label="Change target date"
              onPress={() => {
                setDraftTargetDate(project.targetDate);
                setEditingDeadline(true);
              }}
            />
          )}
          {project.status === 'active' && <PrimaryButton label="Mark complete" onPress={confirmMarkComplete} />}
        </View>

        {/* Capacity: whether the project's remaining linked tasks fit before its target date,
            simulated through the real planner — never a rough estimate, never a change that
            touches a real plan. */}
        <View style={[styles.section, capacity.fits ? styles.capacityOk : styles.capacityConflict]}>
          <Text style={styles.sectionTitle}>Capacity</Text>
          {capacity.totalMinutesNeeded === 0 ? (
            <Text style={styles.capacityText}>No remaining estimated work — nothing to check.</Text>
          ) : capacity.fits ? (
            <Text style={styles.capacityText}>
              {formatMinutes(capacity.totalMinutesNeeded)} of remaining work fits across {capacity.placements.length}{' '}
              day(s) before {formatDateLabel(project.targetDate)}.
            </Text>
          ) : (
            <>
              <Text style={[styles.capacityText, { color: colors.danger, fontWeight: '700' }]}>
                Capacity conflict: {formatMinutes(capacity.totalMinutesNeeded - capacity.totalMinutesPlaced)} of work
                will not fit before {formatDateLabel(project.targetDate)}.
              </Text>
              <Text style={styles.capacityText}>
                {formatMinutes(capacity.totalMinutesPlaced)} of {formatMinutes(capacity.totalMinutesNeeded)} placed —
                sleep, fixed commitments, and anything already accepted are never displaced to make room.
              </Text>
              <Text style={styles.capacitySubtitle}>Proposal — adjust and recheck:</Text>
              {capacity.unplacedTaskIds.map((taskId) => {
                const t = tasks.find((task) => task.id === taskId);
                if (!t) return null;
                return (
                  <View key={taskId} style={styles.unplacedRow}>
                    <Text style={styles.taskTitle}>
                      {t.title} — {t.estimateMinutes} min
                    </Text>
                    <GhostButton label="Remove from project" onPress={() => unlinkTask(taskId)} tone="danger" />
                  </View>
                );
              })}
              <Text style={styles.capacityHint}>Or extend the target date above to open more days.</Text>
            </>
          )}
        </View>

        {deadlines.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming deadlines</Text>
            {deadlines.map((d) => (
              <Text key={`${d.kind}-${d.id}`} style={styles.deadlineRow}>
                • {formatDateLabel(d.date)} — {d.title} ({d.kind})
              </Text>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Milestones</Text>
          {projectMilestones.map((m) => {
            const milestoneTasks = tasksForMilestone(tasks, m.id);
            const done = milestoneTasks.filter((t) => t.status === 'completed').length;
            return (
              <View key={m.id} style={styles.milestoneCard}>
                <View style={styles.sectionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.milestoneTitle}>{m.title}</Text>
                    <Text style={styles.taskMeta}>
                      Due {formatDateLabel(m.targetDate)} · {done}/{milestoneTasks.length} task(s) done
                      {m.status === 'completed' ? ' · Completed' : ''}
                    </Text>
                  </View>
                  {m.status === 'pending' ? (
                    <SecondaryButton label="Mark complete" onPress={() => markMilestoneCompleted(m.id)} />
                  ) : (
                    <SecondaryButton label="Reopen" onPress={() => reopenMilestone(m.id)} />
                  )}
                </View>

                {milestoneTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onUnlink={() => unlinkTask(t.id)} />
                ))}

                <View style={styles.inlineActions}>
                  <SecondaryButton
                    label="+ Link existing task"
                    onPress={() => setLinkPickerFor(linkPickerFor === m.id ? null : m.id)}
                  />
                  <SecondaryButton
                    label="+ New task"
                    onPress={() => router.push(`/task-new?projectId=${project.id}&milestoneId=${m.id}`)}
                  />
                </View>
                {linkPickerFor === m.id && (
                  <View style={styles.picker}>
                    {linkableTasks.length === 0 ? (
                      <Text style={styles.taskMeta}>No unlinked tasks available.</Text>
                    ) : (
                      linkableTasks.map((t) => (
                        <PressableScale key={t.id} onPress={() => linkTask(t.id, m.id)} style={styles.pickerRow}>
                          <Text style={styles.taskTitle}>{t.title}</Text>
                          <Text style={styles.taskMeta}>{t.estimateMinutes} min</Text>
                        </PressableScale>
                      ))
                    )}
                  </View>
                )}
                <View style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}>
                  <DangerButton label="Delete milestone" onPress={() => removeMilestone(m.id)} />
                </View>
              </View>
            );
          })}

          <View style={styles.newMilestoneForm}>
            <Text style={styles.capacitySubtitle}>Add milestone</Text>
            <TextInput
              value={newMilestoneTitle}
              onChangeText={setNewMilestoneTitle}
              placeholder="Milestone title"
              placeholderTextColor={colors.textMuted}
              style={styles.textInput}
            />
            <DateField label="Target date" value={newMilestoneDate} onChange={setNewMilestoneDate} />
            <SecondaryButton
              label="Add milestone"
              onPress={handleAddMilestone}
              disabled={newMilestoneTitle.trim().length === 0 || !isValidDate(newMilestoneDate)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project tasks (no milestone)</Text>
          {unassigned.map((t) => (
            <TaskRow key={t.id} task={t} onUnlink={() => unlinkTask(t.id)} />
          ))}
          <View style={styles.inlineActions}>
            <SecondaryButton
              label="+ Link existing task"
              onPress={() => setLinkPickerFor(linkPickerFor === 'project' ? null : 'project')}
            />
            <SecondaryButton label="+ New task" onPress={() => router.push(`/task-new?projectId=${project.id}`)} />
          </View>
          {linkPickerFor === 'project' && (
            <View style={styles.picker}>
              {linkableTasks.length === 0 ? (
                <Text style={styles.taskMeta}>No unlinked tasks available.</Text>
              ) : (
                linkableTasks.map((t) => (
                  <PressableScale key={t.id} onPress={() => linkTask(t.id)} style={styles.pickerRow}>
                    <Text style={styles.taskTitle}>{t.title}</Text>
                    <Text style={styles.taskMeta}>{t.estimateMinutes} min</Text>
                  </PressableScale>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted },
  description: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  sectionTitle: { ...typography.label, color: colors.textFaint, marginBottom: spacing.xs },
  capacityOk: { borderColor: colors.success },
  capacityConflict: { backgroundColor: colors.tintDanger, borderColor: colors.danger },
  capacityText: { ...typography.caption, color: colors.text, lineHeight: 18 },
  capacitySubtitle: { ...typography.caption, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  capacityHint: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  unplacedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  deadlineRow: { ...typography.caption, color: colors.text, marginBottom: 2 },
  milestoneCard: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  milestoneTitle: { ...typography.bodyStrong, fontSize: 15, color: colors.text },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  taskTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  taskMeta: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  unlinkText: { ...typography.caption, fontSize: 12, fontWeight: '700', color: colors.danger },
  inlineActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  picker: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  pickerRow: { paddingVertical: spacing.xs, flexDirection: 'row', justifyContent: 'space-between' },
  newMilestoneForm: { marginTop: spacing.sm, gap: spacing.xs },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
});
