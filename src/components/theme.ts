export const colors = {
  background: '#F5F6FA',
  card: '#FFFFFF',
  text: '#1C1C28',
  textMuted: '#6B6B7B',
  border: '#E3E4EC',
  primary: '#3B5BFD',
  primaryText: '#FFFFFF',
  danger: '#D64550',
  warning: '#B8860B',
  success: '#1E8E5A',
  fixed: '#5B5F97',
  meal: '#B8860B',
  task: '#3B5BFD',
  breakBlock: '#1E8E5A',
  buffer: '#8C8C9C',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
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
