import { StyleSheet, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

/** Labelled input with an inline validation message. */
export function FormField({ label, error, ...inputProps }: FormFieldProps) {
  const warning = useThemeColor({}, 'warning');

  return (
    <View style={styles.field}>
      <ThemedText type="label" style={styles.label}>
        {label}
      </ThemedText>
      <TextField {...inputProps} />
      {error && (
        <ThemedText type="secondary" style={[styles.error, { color: warning }]}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.sm,
  },
  label: {
    opacity: 0.6,
  },
  error: {
    fontSize: 13,
  },
});
