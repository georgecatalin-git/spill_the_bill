/**
 * Web has no Keychain. `localStorage` is the closest equivalent a browser
 * offers; the token is still origin-scoped and never leaves the device.
 */
export const guestStorage = {
  async getItem(key: string) {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string) {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string) {
    globalThis.localStorage?.removeItem(key);
  },
};
