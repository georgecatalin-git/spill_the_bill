import { StyleSheet, Text, View } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

type AvatarProps = {
  name: string;
  size?: number;
};

/** Takes the first letter of the first and last word: "George Catalin" -> "GC". */
export function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 40 }: AvatarProps) {
  const border = useThemeColor({}, 'border');
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          borderColor: border,
        },
      ]}>
      <Text
        style={[
          styles.initials,
          { color: text, fontSize: size * 0.34, lineHeight: size * 0.44 },
        ]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  initials: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
