import { Alert } from 'react-native';

export type ConfirmRequest = {
  title: string;
  message: string;
  /** Label for the button that goes ahead. */
  confirmLabel: string;
  /** Styles the button as destructive on platforms that draw one. */
  destructive?: boolean;
};

/**
 * Asks before doing something that cannot be taken back.
 *
 * Split into a native and a web implementation because `Alert.alert` is an
 * empty function in react-native-web — literally `static alert() {}` — so a
 * destructive action guarded by it silently does nothing in a browser: no
 * dialog, no error, no clue the tap was received. Same trick as
 * `guest-storage` / `guest-storage.web`.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  destructive,
}: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
