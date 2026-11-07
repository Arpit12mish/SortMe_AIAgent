import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colors, radii, spacing, typography } from '../components/theme';
import { elapsedMs, overrunMinutes, remainingMs } from '../focus/sessionEngine';
import type { FocusOutcome } from '../focus/types';
import { useAppState } from '../state/AppStateContext';
import { useFocusSessions } from '../state/FocusSessionContext';

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const sign = ms < 0 ? '-' : '';
  const parts = h > 0 ? [h, m, s] : [m, s];
  return sign + parts.map((p) => String(p).padStart(2, '0')).join(':');
}

const OUTCOME_OPTIONS: { value: FocusOutcome; label: string }[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'partial', label: 'Partly completed' },
  { value: 'blocked', label: 'Blocked' },
];

export default function SessionScreen() {
  const router = useRouter();
  const { activeSession, pause, resume, finish, stopEarly } = useFocusSessions();
  const { reportDelay, markTaskCompleted } = useAppState();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ending, setEnding] = useState<'finished' | 'stopped_early' | null>(null);
  const [outcome, setOutcome] = useState<FocusOutcome>('completed');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);

  // The interval only forces a re-render so the display keeps ticking while
  // the screen is open; the elapsed/remaining VALUES themselves are always
  // recomputed from activeSession's persisted timestamps below, never from
  // this counter. Closing and reopening the app recovers the exact same
  // numbers without this effect having ever run.
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'running') return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  if (!activeSession) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No focus session is active.</Text>
          <SecondaryButton label="Close" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const elapsed = elapsedMs(activeSession, nowMs);
  const remaining = remainingMs(activeSession, nowMs);
  const isOverrun = remaining < 0;
  const isPaused = activeSession.status === 'paused';

  const startEnding = (mode: 'finished' | 'stopped_early') => {
    setOutcome('completed');
    setNote('');
    setEnding(mode);
  };

  const confirmEnd = async () => {
    setWorking(true);
    try {
      const overrun = overrunMinutes(activeSession, Date.now());
      const taskId = activeSession.taskId;
      const ended =
        ending === 'finished' ? await finish(outcome, note || undefined) : await stopEarly(outcome, note || undefined);
      if (!ended) {
        router.back();
        return;
      }
      // The only signal in the app that a task is actually done — once marked, it's
      // permanently excluded from the pool and can never roll over to a later date.
      if (outcome === 'completed') {
        await markTaskCompleted(taskId);
      }
      if (ending === 'finished' && overrun > 5) {
        Alert.alert(
          'This took longer than planned',
          `"${activeSession.taskTitle}" ran about ${overrun} minutes over its estimate. Replan the rest of today around that?`,
          [
            { text: 'Not now', style: 'cancel', onPress: () => router.back() },
            {
              text: 'Replan',
              onPress: async () => {
                await reportDelay(taskId, overrun);
                router.replace('/replan-review');
              },
            },
          ]
        );
      } else {
        router.back();
      }
    } finally {
      setWorking(false);
    }
  };

  if (ending) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.content}>
          <Text style={styles.title}>How did it go?</Text>
          <Text style={styles.subtitle}>{activeSession.taskTitle}</Text>

          <View style={styles.outcomeRow}>
            {OUTCOME_OPTIONS.map((o) => (
              <SecondaryButton
                key={o.value}
                label={outcome === o.value ? `✓ ${o.label}` : o.label}
                onPress={() => setOutcome(o.value)}
              />
            ))}
          </View>

          <Text style={styles.noteLabel}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Anything worth remembering about this session"
            multiline
          />

          <View style={styles.footer}>
            <SecondaryButton label="Back" onPress={() => setEnding(null)} disabled={working} />
            <PrimaryButton label="Save" onPress={confirmEnd} loading={working} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.subtitle}>{activeSession.taskTitle}</Text>
        <Text style={[styles.timer, isOverrun && { color: colors.warning }]}>{formatDuration(elapsed)}</Text>
        <Text style={styles.remaining}>
          {isOverrun ? `${formatDuration(remaining)} over the ${activeSession.estimateMinutes}-minute estimate` : `${formatDuration(remaining)} remaining of ${activeSession.estimateMinutes} min`}
        </Text>
        {isPaused && <Text style={styles.pausedBadge}>Paused</Text>}

        <View style={styles.controls}>
          {isPaused ? (
            <PrimaryButton label="Resume" onPress={resume} />
          ) : (
            <SecondaryButton label="Pause" onPress={pause} />
          )}
        </View>
        <View style={styles.footer}>
          <SecondaryButton label="Stop early" onPress={() => startEnding('stopped_early')} />
          <PrimaryButton label="Finish" onPress={() => startEnding('finished')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 16 },
  title: { ...typography.heading, fontSize: 22, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.bodyStrong, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  timer: {
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -1,
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  remaining: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  pausedBadge: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    ...typography.label,
    color: colors.warning,
  },
  controls: { marginTop: spacing.xl, alignItems: 'center' },
  outcomeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  noteLabel: { ...typography.caption, fontWeight: '600', color: colors.textMuted, marginTop: spacing.lg },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 80,
    marginTop: spacing.xs,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  footer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
});
