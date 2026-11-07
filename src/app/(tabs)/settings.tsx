import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DangerButton, PrimaryButton } from '../../components/Buttons';
import { FixedCommitmentsEditor } from '../../components/editors/FixedCommitmentsEditor';
import { FocusBlocksEditor } from '../../components/editors/FocusBlocksEditor';
import { GoalsEditor } from '../../components/editors/GoalsEditor';
import { MealWindowsEditor } from '../../components/editors/MealWindowsEditor';
import { ProtectedTimeEditor } from '../../components/editors/ProtectedTimeEditor';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import { TimeField } from '../../components/TimeField';
import { HOURLY_CHECKIN_FREQUENCIES } from '../../hourly/types';
import { useAppState } from '../../state/AppStateContext';
import { useHourlyCheckIns } from '../../state/HourlyStateContext';
import { useReminders } from '../../state/ReminderStateContext';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { preferences, updatePreferences, reviewPreferencesChange, resetAppData } = useAppState();
  const { enabled, permissionDenied, setEnabled } = useReminders();
  const { settings: hourlySettings, permissionDenied: hourlyPermissionDenied, setEnabled: setHourlyEnabled, updateSettings: updateHourlySettings } =
    useHourlyCheckIns();
  const [togglingReminders, setTogglingReminders] = useState(false);
  const [togglingHourly, setTogglingHourly] = useState(false);
  const [travelTimeText, setTravelTimeText] = useState(String(preferences?.travelTimeMinutes ?? 0));
  const [reviewing, setReviewing] = useState(false);

  if (!preferences) return null;

  const handleToggleReminders = async () => {
    setTogglingReminders(true);
    try {
      await setEnabled(!enabled);
    } finally {
      setTogglingReminders(false);
    }
  };

  const handleToggleHourly = async () => {
    setTogglingHourly(true);
    try {
      await setHourlyEnabled(!hourlySettings.enabled);
    } finally {
      setTogglingHourly(false);
    }
  };

  const commitTravelTime = (text: string) => {
    setTravelTimeText(text);
    const minutes = parseInt(text, 10);
    updatePreferences({ travelTimeMinutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : 0 });
  };

  const handleReview = async () => {
    setReviewing(true);
    try {
      await reviewPreferencesChange('Preferences updated.');
      router.push('/week');
    } finally {
      setReviewing(false);
    }
  };

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
        <Text style={styles.fieldLabel}>Travel time buffer (minutes)</Text>
        <TextInput
          value={travelTimeText}
          onChangeText={commitTravelTime}
          keyboardType="number-pad"
          style={styles.numberInput}
        />
        <Text style={styles.reminderHint}>
          Automatically reserved before and after every commitment above that has a location set.
        </Text>

        <SectionHeader title="Protected time" />
        <ProtectedTimeEditor
          value={preferences.protectedTimeBlocks}
          onChange={(protectedTimeBlocks) => updatePreferences({ protectedTimeBlocks })}
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

        <SectionHeader title="Reminders" />
        <PressableScale onPress={handleToggleReminders} style={styles.reminderRow} disabled={togglingReminders}>
          <Text style={styles.reminderLabel}>{enabled ? 'Reminders are on' : 'Reminders are off'}</Text>
          <Text style={styles.reminderToggle}>{enabled ? 'Turn off' : 'Turn on'}</Text>
        </PressableScale>
        <Text style={styles.reminderHint}>
          {permissionDenied
            ? 'Notification permission was denied. Enable it for SortMe in your device settings to turn reminders on.'
            : "When on, SortMe sends local reminders for upcoming focus blocks, check-ins, and interview follow-ups. Turning this on will ask for notification permission."}
        </Text>

        <SectionHeader title="Hourly check-ins" />
        <PressableScale onPress={handleToggleHourly} style={styles.reminderRow} disabled={togglingHourly}>
          <Text style={styles.reminderLabel}>{hourlySettings.enabled ? 'Hourly check-ins are on' : 'Hourly check-ins are off'}</Text>
          <Text style={styles.reminderToggle}>{hourlySettings.enabled ? 'Turn off' : 'Turn on'}</Text>
        </PressableScale>
        <Text style={styles.reminderHint}>
          {hourlyPermissionDenied
            ? 'Notification permission was denied. Enable it for SortMe in your device settings to turn this on.'
            : 'Prompts you each hour to note what you did and what you want to do next. The Hourly Plan view works whether this is on or not. Turning this on will ask for notification permission.'}
        </Text>

        {hourlySettings.enabled && (
          <>
            <Text style={styles.fieldLabel}>Prompt every</Text>
            <View style={styles.row}>
              {HOURLY_CHECKIN_FREQUENCIES.map((f) => (
                <PressableScale
                  key={f}
                  onPress={() => updateHourlySettings({ frequencyMinutes: f })}
                  style={[styles.frequencyChip, hourlySettings.frequencyMinutes === f && styles.frequencyChipSelected]}
                >
                  <Text
                    style={[styles.frequencyChipText, hourlySettings.frequencyMinutes === f && styles.frequencyChipTextSelected]}
                  >
                    {f}m
                  </Text>
                </PressableScale>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Prompting window (blank = wake/sleep time)</Text>
            <View style={styles.row}>
              <TimeField
                label="Start"
                value={hourlySettings.windowStart ?? ''}
                onChange={(v) => updateHourlySettings({ windowStart: v.length > 0 ? v : undefined })}
              />
              <TimeField
                label="End"
                value={hourlySettings.windowEnd ?? ''}
                onChange={(v) => updateHourlySettings({ windowEnd: v.length > 0 ? v : undefined })}
              />
            </View>

            <PressableScale
              onPress={() => updateHourlySettings({ promptDuringFixed: !hourlySettings.promptDuringFixed })}
              style={styles.reminderRow}
            >
              <Text style={styles.reminderLabel}>Prompt during fixed commitments</Text>
              <Text style={styles.reminderToggle}>{hourlySettings.promptDuringFixed ? 'On' : 'Off'}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => updateHourlySettings({ promptDuringProtected: !hourlySettings.promptDuringProtected })}
              style={styles.reminderRow}
            >
              <Text style={styles.reminderLabel}>Prompt during protected time</Text>
              <Text style={styles.reminderToggle}>{hourlySettings.promptDuringProtected ? 'On' : 'Off'}</Text>
            </PressableScale>
            <Text style={styles.reminderHint}>Never prompts during your configured sleep window.</Text>
          </>
        )}

        <SectionHeader title="Review" />
        <Text style={styles.reminderHint}>
          Every change above saves immediately, but an already-accepted plan for any upcoming day
          is untouched until you review it — only dates it actually affects will show as needing
          review.
        </Text>
        <PrimaryButton label="Review changes across the week" onPress={handleReview} loading={reviewing} />

        <SectionHeader title="Danger zone" />
        <DangerButton label="Reset app data" onPress={confirmReset} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.display, fontSize: 28, color: colors.text },
  helper: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  sectionHeader: {
    ...typography.label,
    color: colors.textFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  value: { ...typography.body, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.md },
  fieldLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  numberInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    marginTop: spacing.xs,
    width: 100,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  reminderLabel: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  reminderToggle: { ...typography.caption, fontWeight: '700', color: colors.primary },
  reminderHint: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 17 },
  frequencyChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  frequencyChipSelected: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  frequencyChipText: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  frequencyChipTextSelected: { color: colors.primary },
});
