import React from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { PressableScale } from './ui';
import { colors, glow, radii, spacing, typography } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, loading }: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, styles.primary, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>{label}</Text>}
    </PressableScale>
  );
}

export function SecondaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, styles.secondary, disabled && styles.disabled]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </PressableScale>
  );
}

export function DangerButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={[styles.base, disabled && styles.disabled]}>
      <Text style={[styles.secondaryText, { color: colors.danger }]}>{label}</Text>
    </PressableScale>
  );
}

/** Small inline text-only action — "Remove from project", "Unlink", "Delete milestone" and the like. */
export function GhostButton({ label, onPress, disabled, tone = 'default' }: ButtonProps & { tone?: 'default' | 'danger' }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={styles.ghost} scaleTo={0.94}>
      <Text style={[styles.ghostText, tone === 'danger' && { color: colors.danger }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
    ...glow(colors.primary),
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.4,
  },
  primaryText: {
    color: colors.primaryText,
    ...typography.bodyStrong,
  },
  secondaryText: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  ghost: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    alignSelf: 'flex-start',
  },
  ghostText: {
    color: colors.primary,
    ...typography.caption,
    fontWeight: '700',
  },
});
