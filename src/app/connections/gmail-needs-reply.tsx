import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { draftGmailReply, listNeedsReply } from '../../ai/api';
import type { NeedsReplyThread } from '../../ai/types';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { colors, radii, shadows, spacing, typography } from '../../components/theme';
import { sendGmailReply } from '../../connections/api';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import { ApiError } from '../../connections/types';

interface ThreadRowState {
  thread: NeedsReplyThread;
  drafting: boolean;
  draft: { to: string | null; subject: string; body: string } | null;
  sending: boolean;
}

function ThreadRow({
  row,
  canSend,
  onDraft,
  onEdit,
  onSend,
}: {
  row: ThreadRowState;
  canSend: boolean;
  onDraft: () => void;
  onEdit: (field: 'subject' | 'body', value: string) => void;
  onSend: () => void;
}) {
  const { thread, drafting, draft, sending } = row;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{thread.subject ?? '(no subject)'}</Text>
      <Text style={styles.meta}>From: {thread.fromAddress ?? 'unknown'}</Text>
      <View style={styles.badgeRow}>
        {thread.daysSinceLastMessage != null && (
          <Text style={styles.meta}>{thread.daysSinceLastMessage} day(s) since last message</Text>
        )}
        {thread.stale && (
          <View style={styles.staleBadge}>
            <Text style={styles.staleBadgeText}>Stale</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {thread.link && <SecondaryButton label="Open in Gmail" onPress={() => Linking.openURL(thread.link!)} />}
        {!draft && <SecondaryButton label="Draft a reply" onPress={onDraft} disabled={drafting} />}
      </View>

      {draft && (
        <View style={styles.draftPanel}>
          <Text style={styles.fieldLabel}>To</Text>
          <Text style={styles.toText}>{draft.to ?? thread.fromAddress ?? 'unknown'}</Text>
          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput value={draft.subject} onChangeText={(v) => onEdit('subject', v)} style={styles.textInput} />
          <Text style={styles.fieldLabel}>Body</Text>
          <TextInput
            value={draft.body}
            onChangeText={(v) => onEdit('body', v)}
            multiline
            style={[styles.textInput, styles.bodyInput]}
          />
          <Text style={styles.reviewNote}>Review and edit this draft. Nothing is sent until you tap Send below.</Text>
          {canSend ? (
            <PrimaryButton label="Send" onPress={onSend} loading={sending} />
          ) : (
            <Text style={styles.reconnectInline}>Reconnect Gmail (above) to enable sending.</Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function GmailNeedsReplyScreen() {
  const { connections, connect } = useConnectionsState();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [rows, setRows] = useState<ThreadRowState[]>([]);

  const gmailConnection = connections.find((c) => c.provider === 'GOOGLE_GMAIL');
  const canSend = !!gmailConnection?.grantedScopes?.includes('gmail.send');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const threads = await listNeedsReply();
        if (cancelled) return;
        setRows(threads.map((thread) => ({ thread, drafting: false, draft: null, sending: false })));
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof ApiError ? e.message : 'Could not check for emails awaiting reply.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (threadId: string, patch: Partial<ThreadRowState>) => {
    setRows((prev) => prev.map((r) => (r.thread.threadId === threadId ? { ...r, ...patch } : r)));
  };

  const handleDraft = async (threadId: string) => {
    updateRow(threadId, { drafting: true });
    try {
      const draft = await draftGmailReply(threadId);
      updateRow(threadId, { drafting: false, draft: { to: draft.to, subject: draft.subject, body: draft.body } });
    } catch (e) {
      updateRow(threadId, { drafting: false });
      Alert.alert('Could not draft a reply', e instanceof ApiError ? e.message : 'Try again shortly.');
    }
  };

  const handleEdit = (threadId: string, field: 'subject' | 'body', value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.thread.threadId === threadId && r.draft ? { ...r, draft: { ...r.draft, [field]: value } } : r))
    );
  };

  const handleSend = (row: ThreadRowState) => {
    if (!row.draft) return;
    const { thread, draft } = row;
    const to = draft.to ?? thread.fromAddress ?? '';
    Alert.alert('Send this email?', `To: ${to}\nSubject: ${draft.subject}\n\n${draft.body.slice(0, 100)}${draft.body.length > 100 ? '…' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          updateRow(thread.threadId, { sending: true });
          try {
            await sendGmailReply({ threadId: thread.threadId, to, subject: draft.subject, body: draft.body });
            setRows((prev) => prev.filter((r) => r.thread.threadId !== thread.threadId));
            Alert.alert('Sent', 'Your reply was sent.');
          } catch (e) {
            updateRow(thread.threadId, { sending: false });
            if (e instanceof ApiError && e.requiresReconnect) {
              Alert.alert('Reconnect needed', 'Reconnect Gmail to enable sending, then try again.');
            } else {
              Alert.alert('Could not send', e instanceof ApiError ? e.message : 'Try again shortly.');
            }
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>
          Threads where the last message wasn’t from you. Draft a reply with AI, review it, then send when you’re ready.
        </Text>

        {!canSend && (
          <View style={styles.reconnectBanner}>
            <Text style={styles.reconnectText}>
              Reconnect Gmail to let SortMe send replies on your behalf. Drafting and reviewing still works without
              this.
            </Text>
            <SecondaryButton label="Reconnect Gmail" onPress={() => connect('GOOGLE_GMAIL')} />
          </View>
        )}

        {status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {status === 'error' && <Text style={styles.errorText}>{errorMessage}</Text>}

        {status === 'ready' && rows.length === 0 && (
          <Text style={styles.helper}>Nothing is awaiting your reply right now.</Text>
        )}

        {rows.map((row) => (
          <ThreadRow
            key={row.thread.threadId}
            row={row}
            canSend={canSend}
            onDraft={() => handleDraft(row.thread.threadId)}
            onEdit={(field, value) => handleEdit(row.thread.threadId, field, value)}
            onSend={() => handleSend(row)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  helper: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  errorText: { ...typography.body, color: colors.danger },
  center: { alignItems: 'center', padding: spacing.lg },
  reconnectBanner: {
    backgroundColor: colors.tintPrimary,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reconnectText: { ...typography.caption, color: colors.text },
  reconnectInline: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  staleBadge: { backgroundColor: colors.tintDanger, borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  staleBadgeText: { ...typography.caption, fontSize: 11, color: colors.danger, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  draftPanel: { marginTop: spacing.sm, gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textFaint },
  toText: { ...typography.body, color: colors.text },
  textInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardSunken,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  bodyInput: { minHeight: 100, textAlignVertical: 'top' },
  reviewNote: { ...typography.caption, color: colors.textFaint, fontStyle: 'italic' },
});
