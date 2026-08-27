export type AuthUser = {
  id: string;
  name: string;
  email: string;
  /**
   * True for a session opened by scanning a table's code — no email, no
   * password, no sign-up. They are a full `auth.uid()` in every other respect;
   * this only says the app has never been told who they are.
   */
  isGuest: boolean;
};

/**
 * Everything the app needs from an authentication provider.
 *
 * Implemented by the Supabase service, and by the mock used when no Supabase
 * project is configured. Admins only — guests never authenticate.
 */
export type AuthService = {
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (name: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  /** A session for somebody with no account, opened by scanning a table's code. */
  signInAnonymously: () => Promise<AuthUser>;
  /** The admin from a stored session, or null when nobody is signed in. */
  getCurrentUser: () => Promise<AuthUser | null>;
  resetPassword: (email: string) => Promise<void>;
  /** Subscribes to sign-in/out changes. Returns an unsubscribe function. */
  onAuthStateChange: (listener: (user: AuthUser | null) => void) => () => void;
};

/** Thrown when credentials are rejected, so the UI can show a message. */
export class AuthError extends Error {}
