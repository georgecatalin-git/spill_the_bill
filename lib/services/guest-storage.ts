import * as SecureStore from 'expo-secure-store';

/**
 * Where the guest session is kept on device.
 *
 * The session token is a bearer secret, so it goes in the Keychain / Keystore
 * rather than plain storage. The web build uses `guest-storage.web.ts`.
 */
export const guestStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
