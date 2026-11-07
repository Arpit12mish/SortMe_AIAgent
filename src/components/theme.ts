import type { TextStyle, ViewStyle } from 'react-native';
import { Platform } from 'react-native';

export const colors = {
  background: '#0E0E14',
  backgroundAlt: '#121218',
  card: '#1A1A23',
  cardElevated: '#20202C',
  cardSunken: '#0B0B10',
  text: '#F2F2F6',
  textMuted: '#9897A9',
  textFaint: '#5F5E6E',
  border: '#2A2A38',
  borderStrong: '#383850',
  primary: '#4D7FFF',
  primaryMuted: '#35405E',
  primaryText: '#FFFFFF',
  danger: '#FF5C72',
  warning: '#FFB84D',
  success: '#3DDC97',
  fixed: '#8C8FE8',
  meal: '#FFB84D',
  task: '#4D7FFF',
  breakBlock: '#3DDC97',
  buffer: '#71708A',
  protected: '#C58CFF',
  // Translucent tints for banners/badges/selected-state fills — the dark-mode
  // equivalent of the old flat pastel hexes (#EFF2FF/#FFF7E6/#FDECEC) that
  // used to be scattered across screens.
  tintPrimary: 'rgba(77,127,255,0.16)',
  tintSuccess: 'rgba(61,220,151,0.14)',
  tintWarning: 'rgba(255,184,77,0.14)',
  tintDanger: 'rgba(255,92,114,0.14)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
};

/**
 * Elevation presets. Android ignores shadowColor for non-black shadows (it only
 * reads `elevation`), so a colored `glow()` is iOS-only by platform design —
 * Android gets a flat `elevation` plus the caller's own accent-tinted border as
 * a cross-platform substitute cue.
 */
export const shadows: Record<'card' | 'raised' | 'none', ViewStyle> = {
  card: Platform.select({
    ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16 },
    android: { elevation: 4 },
    default: {},
  }) as ViewStyle,
  raised: Platform.select({
    ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.38, shadowRadius: 24 },
    android: { elevation: 8 },
    default: {},
  }) as ViewStyle,
  none: {},
};

export function glow(color: string): ViewStyle {
  return Platform.select({
    ios: { shadowColor: color, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 18 },
    android: { elevation: 6 },
    default: {},
  }) as ViewStyle;
}

type TypePreset = Pick<TextStyle, 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight'>;

export const typography: Record<
  'display' | 'title' | 'heading' | 'bodyStrong' | 'body' | 'caption' | 'label' | 'micro',
  TypePreset
> = {
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, lineHeight: 38 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, lineHeight: 30 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.1, lineHeight: 24 },
  bodyStrong: { fontSize: 16, fontWeight: '600', letterSpacing: -0.1, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, lineHeight: 14 },
  micro: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, lineHeight: 13 },
};

export function colorForBlockKind(kind: string): string {
  switch (kind) {
    case 'fixed':
      return colors.fixed;
    case 'meal':
      return colors.meal;
    case 'task':
      return colors.task;
    case 'break':
      return colors.breakBlock;
    case 'buffer':
      return colors.buffer;
    case 'protected':
      return colors.protected;
    default:
      return colors.textMuted;
  }
}

export function colorForPriority(priority: string): string {
  switch (priority) {
    case 'urgent':
      return colors.danger;
    case 'high':
      return colors.warning;
    case 'medium':
      return colors.primary;
    default:
      return colors.textMuted;
  }
}

export function colorForHabitStatus(status: string): string {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'partial':
      return colors.warning;
    case 'missed':
      return colors.danger;
    default:
      return colors.border; // 'untracked' and rest days — a neutral, empty-cell tone
  }
}
