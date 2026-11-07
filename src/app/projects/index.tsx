import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Buttons';
import { ProjectProgressCard } from '../../components/ProjectProgressCard';
import { colors, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { computeProjectProgress } from '../../projects/projectEngine';
import { useAppState } from '../../state/AppStateContext';
import { useFocusSessions } from '../../state/FocusSessionContext';
import { useProjectState } from '../../state/ProjectStateContext';

export default function ProjectsScreen() {
  const router = useRouter();
  const { projects, milestones } = useProjectState();
  const { tasks } = useAppState();
  const { sessions } = useFocusSessions();

  const active = useMemo(() => projects.filter((p) => p.status === 'active'), [projects]);
  const inactive = useMemo(() => projects.filter((p) => p.status !== 'active'), [projects]);
  const sorted = [...active, ...inactive];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <PrimaryButton label="+ New project" onPress={() => router.push('/projects/new')} />
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const progress = computeProjectProgress(item.id, milestones, tasks, sessions);
          return (
            <PressableScale onPress={() => router.push(`/projects/${item.id}`)} style={styles.row}>
              <ProjectProgressCard project={item} progress={progress} compact />
            </PressableScale>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No projects yet. Create one for a goal, internship, or freelance engagement with several hours of
              work.
            </Text>
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
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: { marginBottom: spacing.sm },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
