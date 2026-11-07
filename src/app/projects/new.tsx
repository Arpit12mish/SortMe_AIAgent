import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Buttons';
import { DateField, isValidDate } from '../../components/DateField';
import { colorForPriority, colors, radii, spacing, typography } from '../../components/theme';
import { PressableScale } from '../../components/ui';
import type { ProjectPriority } from '../../projects/types';
import { useProjectState } from '../../state/ProjectStateContext';

const PRIORITIES: ProjectPriority[] = ['low', 'medium', 'high', 'urgent'];

export default function NewProjectScreen() {
  const router = useRouter();
  const { addProject } = useProjectState();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('medium');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && isValidDate(targetDate);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const project = await addProject({
        title: title.trim(),
        description: description.trim() || undefined,
        targetDate,
        priority,
      });
      router.replace(`/projects/${project.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Acme Corp internship"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What this is and why it matters"
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, styles.multiline]}
          multiline
        />

        <Text style={styles.label}>Target date</Text>
        <DateField label="" value={targetDate} onChange={setTargetDate} />

        <Text style={styles.label}>Priority</Text>
        <View style={styles.chipRow}>
          {PRIORITIES.map((p) => (
            <PressableScale
              key={p}
              onPress={() => setPriority(p)}
              scaleTo={0.93}
              style={[
                styles.chip,
                priority === p && { backgroundColor: colorForPriority(p), borderColor: colorForPriority(p) },
              ]}
            >
              <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>{p}</Text>
            </PressableScale>
          ))}
        </View>

        <View style={styles.footer}>
          <PrimaryButton label="Create project" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  label: { ...typography.caption, fontWeight: '600', color: colors.textMuted, marginTop: spacing.md },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.cardSunken,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.primaryText },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xl },
});
