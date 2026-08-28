import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics that can never break a button.
 *
 * Two things are wrapped up here. Devices without a taptic engine reject these
 * calls, and web has none at all — a rejected promise from a decoration must
 * not take the press with it, so every call is swallowed. And keeping them
 * behind names like `confirm` rather than `ImpactFeedbackStyle.Medium` is what
 * stops the app drifting into buzzing at everything: there are five reasons to
 * vibrate a phone, and they are all here.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function fire(run: () => Promise<void>) {
  if (!supported) return;
  run().catch(() => {
    // A phone that cannot do this is not an error worth surfacing.
  });
}

export const haptics = {
  /** Picking something: a chip, a row, a quantity. The commonest, and the lightest. */
  select: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A primary action being committed. */
  confirm: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** It worked: a bill closed, a payment recorded, a table created. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** It was refused, and the reason is on screen. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

export type HapticKind = keyof typeof haptics | 'none';
