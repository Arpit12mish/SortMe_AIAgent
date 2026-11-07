import React, { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, duration, radii, shadows, spacing, typography } from './theme';

/**
 * Press feedback wrapper shared by every tappable row/card in the app — scales
 * down slightly and dims on press-in, springs back on release. Centralizing
 * this means the whole app's touch feel changes in one place rather than each
 * screen re-deriving its own `pressed` opacity logic.
 */
export function PressableScale({
  children,
  style,
  onPressIn,
  onPressOut,
  scaleTo = 0.97,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const [opacity] = useState(() => new Animated.Value(1));

  return (
    <Pressable
      onPressIn={(e) => {
        Animated.parallel([
          Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }),
          Animated.timing(opacity, { toValue: 0.85, duration: duration.fast, useNativeDriver: true }),
        ]).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
          Animated.timing(opacity, { toValue: 1, duration: duration.fast, useNativeDriver: true }),
        ]).start();
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }], opacity }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Card({
  children,
  style,
  elevated = false,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  padded?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        shadows.card,
        elevated && { backgroundColor: colors.cardElevated },
        padded && { padding: spacing.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

export function Badge({
  label,
  color = colors.textMuted,
  tint,
}: {
  label: string;
  color?: string;
  tint?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: tint ?? `${color}26` }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textFaint,
    marginBottom: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  badgeText: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});

export const animationDuration = duration;
