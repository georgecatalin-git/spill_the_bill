import { StyleSheet, Text, type TextProps } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | 'title'
    | 'subtitle'
    | 'heading'
    | 'default'
    | 'label'
    | 'secondary'
    | 'caption'
    | 'money'
    | 'moneyLarge';
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
    type === 'secondary' || type === 'caption' ? 'textSecondary' : 'text'
  );

  return (
    <Text
      style={[
        { color },
        type === 'title' && styles.title,
        type === 'subtitle' && styles.subtitle,
        type === 'heading' && styles.heading,
        type === 'default' && styles.default,
        type === 'label' && styles.label,
        type === 'secondary' && styles.secondary,
        type === 'caption' && styles.caption,
        type === 'money' && styles.money,
        type === 'moneyLarge' && styles.moneyLarge,
        style,
      ]}
      {...rest}
    />
  );
}

// Every entry comes from the one scale in `constants/theme.ts`, so a size can
// only be changed in a way that changes it everywhere.
const styles = StyleSheet.create({
  title: Type.display,
  subtitle: Type.title,
  heading: Type.heading,
  default: Type.body,
  label: { ...Type.label, textTransform: 'uppercase' },
  secondary: Type.secondary,
  caption: Type.caption,
  money: { ...Type.money, fontVariant: ['tabular-nums'] },
  moneyLarge: { ...Type.moneyLarge, fontVariant: ['tabular-nums'] },
});
