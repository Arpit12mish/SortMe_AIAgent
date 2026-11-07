import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/Buttons';
import { colors, radii, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import {
  CHOICE_LABEL,
  buildHourlyGrid,
  choiceSuggestsReplan,
  describeHourlyReplanTrigger,
} from '../hourly/hourlyEngine';
import type { HourlyCheckInChoice } from '../hourly/types';
import { formatDateLabel, minutesToTimeString } from '../planning/time';
import { useAppState } from '../state/AppStateContext';
import { useHourlyCheckIns } from '../state/HourlyStateContext';

const CHOICES: HourlyCheckInChoice[] = ['followed_plan', 'partly_followed', 'did_something_else', 'interrupted', 'skip'];

export default function HourlyCheckInScreen() {
  const router = useRouter();
  const { date, hour: hourParam } = useLocalSearchParams<{ date: string; hour: string }>();
  const hour = Number(hourParam);
  const { activeDate, preferences, planForDate, reportEventChanged } = useAppState();
  const { getEntry, answerHour, setIntention } = useHourlyCheckIns();
  const { current } = planForDate(date);
  const existing = getEntry(date, hour);

  const [choice, setChoice] = useState<HourlyCheckInChoice | undefined>(existing?.pastChoice);
  const [note, setNote] = useState(existing?.pastNote ?? '');
  const [intention, setIntentionText] = useState(existing?.intention ?? '');
  const [saving, setSaving] = useState(false);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const slot = useMemo(
    () => (preferences ? buildHourlyGrid(date, current, preferences)[hour] : undefined),
    [date, current, preferences, hour]
  );
  const hourHasStarted = slot ? slot.startIso <= nowIso : true;

  if (!preferences || !slot) return null;

  const plannedTitle =
    slot.kind === 'sleep' ? 'Sleep' : slot.kind === 'free' ? 'Free time' : slot.blocks.map((b) => b.title).join(', ');

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedNote = note.trim() || undefined;
      const trimmedIntention = intention.trim() || undefined;
      if (choice) {
        await answerHour(date, hour, { pastChoice: choice, pastNote: trimmedNote, intention: trimmedIntention });
      } else if (trimmedIntention) {
        await setIntention(date, hour, trimmedIntention);
      }

      // A check-in or note must never silently rewrite the schedule — replanning
      // only ever happens after this explicit confirmation, and only for today
      // (the existing replanner only ever reschedules the active date).
      if (choice && choiceSuggestsReplan(choice) && date === activeDate && current) {
        Alert.alert(
          'Replan the rest of today?',
          'This differs from your plan. SortMe can propose an updated schedule — you review it before anything changes.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => router.back() },
            {
              text: 'Replan',
              onPress: async () => {
                await reportEventChanged(describeHourlyReplanTrigger(hour, choice, trimmedNote, trimmedIntention));
                router.replace(`/replan-review?date=${date}`);
              },
            },
          ]
        );
      } else {
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>
          {formatDateLabel(date)} · {minutesToTimeString(hour * 60)}
        </Text>
        <Text style={styles.planned}>Planned: {plannedTitle}</Text>

        {hourHasStarted && (
          <View style={styles.section}>
            <Text style={styles.prompt}>What did you do in the last hour?</Text>
            <View style={styles.choiceRow}>
              {CHOICES.map((c) => (
                <PressableScale
                  key={c}
                  onPress={() => setChoice(c)}
                  style={[styles.choiceChip, choice === c && styles.choiceChipSelected]}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={`${CHOICE_LABEL[c]}${choice === c ? ', selected' : ''}`}
                >
                  <Text style={[styles.choiceText, choice === c && styles.choiceTextSelected]}>{CHOICE_LABEL[c]}</Text>
                </PressableScale>
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.textInput}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.prompt}>What do you want to do in the next hour?</Text>
          <TextInput
            value={intention}
            onChangeText={setIntentionText}
            placeholder="Your intention for this hour (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.textInput}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Save" onPress={handleSave} loading={saving} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  heading: { ...typography.heading, fontSize: 20, color: colors.text },
  planned: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg, gap: spacing.sm },
  prompt: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  choiceChipSelected: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  choiceText: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  choiceTextSelected: { color: colors.primary },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundAlt,
  },
});
