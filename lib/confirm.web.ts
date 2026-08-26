export type { ConfirmRequest } from '@/lib/confirm';
import type { ConfirmRequest } from '@/lib/confirm';

/**
 * The web half of `confirmAction`.
 *
 * `Alert.alert` does nothing at all in react-native-web, so the browser gets
 * the platform's own dialog instead. The confirm label cannot be set on
 * `window.confirm` — it says OK — so the title and message have to carry the
 * whole meaning on their own, which is why the callers spell out what is about
 * to happen rather than relying on the button.
 */
export function confirmAction({ title, message }: ConfirmRequest): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    // Server-rendered pass: never assume consent nobody gave.
    return Promise.resolve(false);
  }

  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
