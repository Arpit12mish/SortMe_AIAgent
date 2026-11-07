import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDailyBriefing } from '../ai/api';
import type { BriefingInterviewSuggestion, BriefingTaskSuggestion, TaskPrioritySuggestion } from '../ai/types';
import { GhostButton, PrimaryButton, SecondaryButton } from '../components/Buttons';
import { colorForPriority, colors, radii, shadows, spacing, typography } from '../components/theme';
import { PressableScale } from '../components/ui';
import { ApiError } from '../connections/types';
import { useConnectionsState } from '../connections/ConnectionsStateContext';
import { STAGE_LABEL } from '../prep/interviewEngine';
import type { InterviewStage } from '../prep/types';
import { dateAndTimeToISO } from '../planning/time';
import type { Task } from '../planning/types';
import { useAppState } from '../state/AppStateContext';
import { usePrepState } from '../state/PrepStateContext';
import { useVoiceRecording } from '../voice/useVoiceRecording';

const PRIORITIES: TaskPrioritySuggestion[] = ['low', 'medium', 'high', 'urgent'];
const STAGES: InterviewStage[] = ['applied', 'phone_screen', 'technical', 'onsite'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

interface TaskRow extends BriefingTaskSuggestion {
  included: boolean;
  dueDate: string; // editable, YYYY-MM-DD or ''
}

interface InterviewRow extends BriefingInterviewSuggestion {
  included: boolean;
  stage: InterviewStage;
  editedDate: string;
  editedTime: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PlaybackButton({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <SecondaryButton
      label={status.playing ? '◼ Stop playback' : '▶ Play back what you said'}
      onPress={() => (status.playing ? player.pause() : player.play())}
    />
  );
}

export default function DailyBriefingScreen() {
  const router = useRouter();
  const { autoScanGmail } = useLocalSearchParams<{ autoScanGmail?: string }>();
  const voice = useVoiceRecording();
  const { connections } = useConnectionsState();
  const { tasks, reportEventChanged, addTask } = useAppState();
  const { addInterview } = usePrepState();

  const [includeGmail, setIncludeGmail] = useState(false);
  const [includeDocs, setIncludeDocs] = useState(false);
  const [analysis, setAnalysis] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [summary, setSummary] = useState('');
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [interviewRows, setInterviewRows] = useState<InterviewRow[]>([]);
  const [applying, setApplying] = useState(false);

  const gmailConnected = connections.some((c) => c.provider === 'GOOGLE_GMAIL' && c.status === 'CONNECTED');
  const docsConnected = connections.some((c) => c.provider === 'GOOGLE_DOCS' && c.status === 'CONNECTED');
  const hasTranscript = voice.transcript.trim().length > 0;

  const runAnalysis = async (transcript: string, gmail: boolean, docs: boolean) => {
    setAnalysis('loading');
    setAnalysisError('');
    try {
      const response = await getDailyBriefing(transcript, gmail, docs);
      setSummary(response.summary);
      setUncertainties(response.uncertainties);
      setTaskRows(response.tasks.map((t) => ({ ...t, included: true, dueDate: t.suggestedDueDate ?? '' })));
      setInterviewRows(
        response.interviews.map((i) => ({
          ...i,
          included: true,
          stage: 'phone_screen',
          editedDate: i.date ?? '',
          editedTime: i.time ?? '',
        }))
      );
      setAnalysis('ready');
    } catch (e) {
      setAnalysisError(e instanceof ApiError ? e.message : 'Could not analyze this right now. Try again shortly.');
      setAnalysis('error');
    }
  };

  const handleAnalyze = () => runAnalysis(voice.transcript.trim(), includeGmail && gmailConnected, includeDocs && docsConnected);

  // Reached from the Gmail screen's "Scan for interviews & tasks" action --
  // skips the recording UI entirely and analyzes Gmail context alone, once,
  // on mount (ref-guarded so a re-render doesn't re-fire it).
  const autoScannedRef = useRef(false);
  useEffect(() => {
    if (autoScannedRef.current || autoScanGmail !== '1' || !gmailConnected) return;
    autoScannedRef.current = true;
    runAnalysis('', true, false);
  }, [autoScanGmail, gmailConnected]);

  const updateTask = <K extends keyof TaskRow>(index: number, field: K, value: TaskRow[K]) => {
    setTaskRows((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const updateInterview = <K extends keyof InterviewRow>(index: number, field: K, value: InterviewRow[K]) => {
    setInterviewRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const tasksDatesValid = taskRows.every((t) => !t.included || t.dueDate === '' || DATE_RE.test(t.dueDate));
  const interviewsDatesValid = interviewRows.every(
    (i) => !i.included || ((i.editedDate === '' || DATE_RE.test(i.editedDate)) && (i.editedTime === '' || TIME_RE.test(i.editedTime)))
  );

  const handleApply = async () => {
    if (!tasksDatesValid || !interviewsDatesValid) return;
    const checkedTasks = taskRows.filter((t) => t.included);
    const checkedInterviews = interviewRows.filter((i) => i.included);
    if (checkedTasks.length === 0 && checkedInterviews.length === 0) {
      router.back();
      return;
    }

    setApplying(true);
    try {
      // Every task is added without its own replan -- a single
      // reportEventChanged afterward produces one proposed plan reflecting
      // the whole batch, which the user reviews before anything changes.
      // Collecting each created task here (rather than re-reading `tasks` from
      // context afterward) is what lets the final reportEventChanged see this
      // whole batch: the `tasks` this closure captured won't reflect any of
      // these additions until a re-render settles, which doesn't happen
      // mid-function.
      const createdTasks: Task[] = [];
      for (const t of checkedTasks) {
        const created = await addTask(
          {
            title: t.title.trim(),
            estimateMinutes: t.estimateMinutes,
            deadline: t.dueDate ? dateAndTimeToISO(t.dueDate, '18:00') : undefined,
            priority: t.priority,
            canMove: true,
          },
          { triggerReplan: false }
        );
        createdTasks.push(created);
      }
      for (const i of checkedInterviews) {
        await addInterview({
          company: i.company,
          role: i.role,
          stage: i.stage,
          outcome: 'pending',
          interviewDate: i.editedDate && i.editedTime ? dateAndTimeToISO(i.editedDate, i.editedTime) : undefined,
          questionsAsked: [],
          notes: [i.interviewerName && `Interviewer: ${i.interviewerName}`, i.meetingLinkOrLocation, i.timezone && `Timezone mentioned: ${i.timezone}`]
            .filter(Boolean)
            .join('\n') || undefined,
        });
      }
      await reportEventChanged(
        `Added ${checkedTasks.length} task(s)${checkedInterviews.length > 0 ? ' and an interview' : ''} from a voice briefing: ${summary}`,
        [...tasks, ...createdTasks]
      );
      router.replace('/replan-review');
    } catch {
      setApplying(false);
    }
  };

  const canAnalyze = hasTranscript && analysis !== 'loading';

  const autoScanning = autoScanGmail === '1' && (analysis === 'idle' || analysis === 'loading');

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {autoScanning && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.helper}>Scanning your inbox for interviews and tasks…</Text>
          </View>
        )}

        {!autoScanning && analysis !== 'ready' && (
          <>
            <Text style={styles.helper}>
              Talk through tomorrow — an interview, what you need to prepare, anything to follow up on. SortMe will
              transcribe it, let you review, and propose tasks before anything is scheduled.
            </Text>

            <View style={styles.micSection}>
              <PressableScale
                onPress={() => (voice.status === 'recording' ? voice.stop() : voice.start())}
                scaleTo={0.94}
                disabled={voice.status === 'requesting_permission' || voice.status === 'transcribing'}
                style={[styles.micButton, voice.status === 'recording' && styles.micButtonActive]}
              >
                <Text style={styles.micGlyph}>{voice.status === 'recording' ? '◼' : '🎤'}</Text>
              </PressableScale>
              <Text style={styles.micStatus}>
                {voice.status === 'requesting_permission'
                  ? 'Requesting permission…'
                  : voice.status === 'recording'
                    ? `Recording — ${formatDuration(voice.durationMillis)} — tap to stop`
                    : voice.status === 'transcribing'
                      ? 'Transcribing…'
                      : hasTranscript
                        ? 'Tap to re-record'
                        : 'Tap to talk'}
              </Text>
              {voice.status === 'recording' && <GhostButton label="Cancel" onPress={voice.cancel} tone="danger" />}
            </View>

            {voice.status === 'error' && voice.errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{voice.errorMessage}</Text>
              </View>
            )}

            {voice.recordingUri && voice.status === 'idle' && <PlaybackButton uri={voice.recordingUri} />}

            <View style={styles.transcriptCard}>
              <Text style={styles.sectionLabel}>
                {hasTranscript ? 'Transcript — edit if anything was misheard' : "Didn't catch that, or prefer to type?"}
              </Text>
              <TextInput
                value={voice.transcript}
                onChangeText={voice.setTranscript}
                multiline
                placeholder="Type here instead…"
                placeholderTextColor={colors.textFaint}
                style={styles.transcriptInput}
              />
            </View>

            {hasTranscript && (
              <View style={styles.consentCard}>
                <Text style={styles.sectionLabel}>Include as context for this analysis</Text>
                <View style={styles.consentRow}>
                  <Text style={styles.consentLabel}>
                    Recent emails{!gmailConnected ? ' (connect Gmail first)' : ''}
                  </Text>
                  <Switch value={includeGmail && gmailConnected} onValueChange={setIncludeGmail} disabled={!gmailConnected} />
                </View>
                <View style={styles.consentRow}>
                  <Text style={styles.consentLabel}>
                    My Doc titles{!docsConnected ? ' (connect Google Docs first)' : ''}
                  </Text>
                  <Switch value={includeDocs && docsConnected} onValueChange={setIncludeDocs} disabled={!docsConnected} />
                </View>
                <Text style={styles.consentHint}>
                  Only sent for this one analysis — nothing is sent until you tap Analyze below.
                </Text>
              </View>
            )}

            {analysis === 'error' && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{analysisError}</Text>
              </View>
            )}

            {hasTranscript && (
              <PrimaryButton
                label={analysis === 'loading' ? 'Analyzing…' : 'Analyze'}
                onPress={handleAnalyze}
                loading={analysis === 'loading'}
                disabled={!canAnalyze}
              />
            )}
          </>
        )}

        {analysis === 'ready' && (
          <>
            <Text style={styles.helper}>{summary}</Text>

            {uncertainties.length > 0 && (
              <View style={styles.uncertainCard}>
                <Text style={styles.sectionLabel}>Worth confirming yourself</Text>
                {uncertainties.map((u, i) => (
                  <Text key={i} style={styles.uncertainText}>
                    • {u}
                  </Text>
                ))}
              </View>
            )}

            {interviewRows.map((row, index) => (
              <View key={`interview-${index}`} style={styles.card}>
                <PressableScale onPress={() => updateInterview(index, 'included', !row.included)} style={styles.checkRow} scaleTo={0.98}>
                  <View style={[styles.checkbox, row.included && styles.checkboxChecked]}>
                    {row.included && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkLabel}>{row.included ? 'Included' : 'Excluded'} — Interview</Text>
                </PressableScale>

                <Text style={styles.fieldLabel}>Company</Text>
                <TextInput value={row.company} onChangeText={(v) => updateInterview(index, 'company', v)} style={styles.textInput} />
                <Text style={styles.fieldLabel}>Role</Text>
                <TextInput value={row.role} onChangeText={(v) => updateInterview(index, 'role', v)} style={styles.textInput} />

                {row.dateTimeUncertain && (
                  <View style={styles.uncertainInlineBanner}>
                    <Text style={styles.uncertainInlineText}>Date/time wasn&apos;t clear — please confirm it below.</Text>
                  </View>
                )}
                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Date</Text>
                    <TextInput
                      value={row.editedDate}
                      onChangeText={(v) => updateInterview(index, 'editedDate', v)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textMuted}
                      style={styles.textInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Time{row.timezone ? ` (${row.timezone} mentioned)` : ''}</Text>
                    <TextInput
                      value={row.editedTime}
                      onChangeText={(v) => updateInterview(index, 'editedTime', v)}
                      placeholder="HH:mm"
                      placeholderTextColor={colors.textMuted}
                      style={styles.textInput}
                    />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Stage</Text>
                <View style={styles.chipRow}>
                  {STAGES.map((s) => (
                    <PressableScale
                      key={s}
                      onPress={() => updateInterview(index, 'stage', s)}
                      scaleTo={0.93}
                      style={[styles.chip, row.stage === s && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, row.stage === s && styles.chipTextSelected]}>{STAGE_LABEL[s]}</Text>
                    </PressableScale>
                  ))}
                </View>
                {row.sourceEmailSubject && <Text style={styles.sourceCaption}>From: {row.sourceEmailSubject}</Text>}
              </View>
            ))}

            {taskRows.map((t, index) => (
              <View key={`task-${index}`} style={styles.card}>
                <PressableScale onPress={() => updateTask(index, 'included', !t.included)} style={styles.checkRow} scaleTo={0.98}>
                  <View style={[styles.checkbox, t.included && styles.checkboxChecked]}>
                    {t.included && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkLabel}>{t.included ? 'Included' : 'Excluded'}</Text>
                </PressableScale>

                <TextInput value={t.title} onChangeText={(v) => updateTask(index, 'title', v)} style={styles.textInput} />

                <View style={styles.chipRow}>
                  {PRIORITIES.map((p) => (
                    <PressableScale
                      key={p}
                      onPress={() => updateTask(index, 'priority', p)}
                      scaleTo={0.93}
                      style={[styles.chip, t.priority === p && { backgroundColor: colorForPriority(p), borderColor: colorForPriority(p) }]}
                    >
                      <Text style={[styles.chipText, t.priority === p && styles.chipTextSelected]}>{p}</Text>
                    </PressableScale>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Due date (optional)</Text>
                <TextInput
                  value={t.dueDate}
                  onChangeText={(v) => updateTask(index, 'dueDate', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={styles.textInput}
                />
                {t.sourceEmailSubject && <Text style={styles.sourceCaption}>From: {t.sourceEmailSubject}</Text>}
              </View>
            ))}

            {taskRows.length === 0 && interviewRows.length === 0 && (
              <Text style={styles.helper}>Nothing concrete was found to suggest — nothing will be added.</Text>
            )}

            <View style={styles.footer}>
              <GhostButton label="Start over" onPress={() => { voice.reset(); setAnalysis('idle'); }} />
              <PrimaryButton
                label={taskRows.length + interviewRows.length === 0 ? 'Close' : 'Add to today'}
                onPress={handleApply}
                loading={applying}
                disabled={!tasksDatesValid || !interviewsDatesValid}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  helper: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  micSection: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  micButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  micGlyph: { fontSize: 36 },
  micStatus: { ...typography.caption, color: colors.textMuted },
  errorBanner: { backgroundColor: colors.tintDanger, borderRadius: radii.md, padding: spacing.md },
  errorText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
  transcriptCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  sectionLabel: { ...typography.label, color: colors.textFaint },
  transcriptInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  consentCard: {
    backgroundColor: colors.cardElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  consentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  consentLabel: { ...typography.body, color: colors.text, flex: 1, marginRight: spacing.sm },
  consentHint: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  uncertainCard: { backgroundColor: colors.tintWarning, borderRadius: radii.md, padding: spacing.md, gap: 4 },
  uncertainText: { ...typography.caption, color: colors.text },
  uncertainInlineBanner: { backgroundColor: colors.tintWarning, borderRadius: radii.sm, padding: spacing.sm },
  uncertainInlineText: { ...typography.caption, color: colors.warning, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  checkLabel: { ...typography.caption, color: colors.textMuted },
  fieldLabel: { ...typography.label, color: colors.textFaint },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.primaryText },
  sourceCaption: { ...typography.caption, fontSize: 12, color: colors.textFaint, fontStyle: 'italic' },
  footer: { marginTop: spacing.md, gap: spacing.sm },
});
