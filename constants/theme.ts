/**
 * Minimal monochrome palette for the "Split" app. Light/dark share the same key set
 * so useThemeColor can index into either with one colorName.
 */

export const Colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F6F6F7',
    text: '#111114',
    textSecondary: '#8A8A8E',
    border: '#E6E6E9',
    accent: '#111114',
    accentText: '#FFFFFF',
    success: '#22A06B',
    warning: '#B0700A',
  },
  dark: {
    background: '#0B0B0D',
    surface: '#1C1C1E',
    text: '#F5F5F7',
    textSecondary: '#9A9AA0',
    border: '#2C2C2E',
    accent: '#FFFFFF',
    accentText: '#0B0B0D',
    success: '#3DD68C',
    warning: '#E8A33D',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;
