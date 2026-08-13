import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'title' | 'subtitle' | 'default' | 'label' | 'secondary';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor(
    { light: lightColor, dark: darkColor },
    type === 'secondary' ? 'textSecondary' : 'text'
  );

  return (
    <Text
      style={[
        { color },
        type === 'title' && styles.title,
        type === 'subtitle' && styles.subtitle,
        type === 'default' && styles.default,
        type === 'label' && styles.label,
        type === 'secondary' && styles.secondary,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  default: {
    fontSize: 16,
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  secondary: {
    fontSize: 15,
    lineHeight: 21,
  },
});
