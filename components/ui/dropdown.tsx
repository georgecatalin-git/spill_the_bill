import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type DropdownOption = {
  value: string;
  label: string;
  hint?: string;
};

type DropdownProps = {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Minimal select control.
 *
 * Built from a Pressable and a Modal rather than a picker library, so it looks
 * the same on both platforms and adds no dependency.
 */
export function Dropdown({ value, options, onChange, placeholder = 'Select' }: DropdownProps) {
  const [open, setOpen] = useState(false);

  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const accent = useThemeColor({}, 'accent');

  const selected = options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: surface, borderColor: border },
          pressed && styles.pressed,
        ]}>
        <ThemedText style={styles.triggerLabel}>{selected?.label ?? placeholder}</ThemedText>
        <Text style={[styles.chevron, { color: textSecondary }]}>⌄</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

        <View style={styles.centered} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: background, borderColor: border }]}>
            {options.map((option, index) => {
              const isSelected = option.value === value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && { borderTopWidth: 1, borderTopColor: border },
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.optionText}>
                    <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
                    {option.hint && (
                      <ThemedText type="secondary" style={styles.optionHint}>
                        {option.hint}
                      </ThemedText>
                    )}
                  </View>

                  {isSelected && <Text style={[styles.check, { color: accent === text ? text : accent }]}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  triggerLabel: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 18,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  sheet: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
  },
  optionHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  check: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
});
