import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton } from '../../components/Buttons';
import { FixedCommitmentsEditor } from '../../components/editors/FixedCommitmentsEditor';
import { FocusBlocksEditor } from '../../components/editors/FocusBlocksEditor';
import { GoalsEditor } from '../../components/editors/GoalsEditor';
import { MealWindowsEditor } from '../../components/editors/MealWindowsEditor';
import { colors, spacing } from '../../components/theme';
import { TimeField } from '../../components/TimeField';
import { useAppState } from '../../state/AppStateContext';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const { preferences, updatePreferences, resetAppData } = useAppState();

  if (!preferences) return null;

  const confirmReset = () => {
    Alert.alert(
      'Reset app data',
      'This deletes all onboarding answers, tasks, and plan history from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => resetAppData() },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.helper}>Every answer from onboarding can be changed here.</Text>

        <SectionHeader title="Timezone" />
        <Text style={styles.value}>{preferences.timezone}</Text>

        <SectionHeader title="Sleep & wake" />
        <View style={styles.row}>
          <TimeField
            label="Wake up"
            value={preferences.sleepWindow.wakeTime}
            onChange={(v) => updatePreferences({ sleepWindow: { ...preferences.sleepWindow, wakeTime: v } })}
          />
          <TimeField
            label="Sleep"
            value={preferences.sleepWindow.sleepTime}
            onChange={(v) => updatePreferences({ sleepWindow: { ...preferences.sleepWindow, sleepTime: v } })}
          />
        </View>

        <SectionHeader title="Fixed commitments" />
        <FixedCommitmentsEditor
          value={preferences.fixedCommitments}
          onChange={(fixedCommitments) => updatePreferences({ fixedCommitments })}
        />

        <SectionHeader title="Meal windows" />
        <MealWindowsEditor value={preferences.mealWindows} onChange={(mealWindows) => updatePreferences({ mealWindows })} />

        <SectionHeader title="Preferred focus time" />
        <FocusBlocksEditor
          value={preferences.preferredFocusBlocks}
          onChange={(preferredFocusBlocks) => updatePreferences({ preferredFocusBlocks })}
        />

        <SectionHeader title="Goals" />
        <GoalsEditor value={preferences.goals} onChange={(goals) => updatePreferences({ goals })} />

        <SectionHeader title="Danger zone" />
        <DangerButton label="Reset app data" onPress={confirmReset} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  helper: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  value: { fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.md },
});
