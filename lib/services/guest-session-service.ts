import { guestStorage } from '@/lib/services/guest-storage';
import { supabase } from '@/lib/supabase';
import type { GuestSession } from '@/lib/types';

const SESSION_KEY = 'split.guest.session';

/** Thrown with a message that is safe to show a guest. */
export class GuestError extends Error {}


/**
 * Guest sessions.
 *
 * A guest is never a Supabase Auth user. Joining returns an opaque token that
 * this device stores; every later request sends the token to a database
 * function that decides what the guest may see. The token is never logged and
 * never placed in a URL.
 */

/** Supabase returns plain objects, not Error instances, so read the field. */
function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message ?? '');
  }
  return '';
}

function toFriendlyError(error: unknown) {
  if (error instanceof GuestError) return error;

  const message = messageOf(error);

  // The server says "link", because for a long time a link was the only way
  // in. A code typed by hand reaches the same function, so the wording has to
  // fit both doors.
  if (message.includes('Invalid invitation link')) {
    return new GuestError('That invitation is not valid. Check the code and try again.');
  }

  // Messages raised by the database functions are already guest-facing.
  if (
    message.includes('no longer accepting guests') ||
    message.includes('session has expired') ||
    message.includes('enter your name') ||
    message.includes('name is too long')
  ) {
    return new GuestError(message);
  }

  if (
    message.toLowerCase().includes('network request failed') ||
    message.toLowerCase().includes('failed to fetch')
  ) {
    return new GuestError('Unable to join the table. Check your connection and try again.');
  }

  return new GuestError('Unable to join the table.');
}

/** Joins a table by invite code and stores the resulting session on device. */
export async function createGuestSession(
  inviteCode: string,
  guestName: string
): Promise<GuestSession> {
  try {
    // Re-uses the participant when this device already holds a session for
    // the same table, so reopening the link does not create a duplicate.
    const existing = await getGuestSession();

    const { data, error } = await supabase.rpc('join_table', {
      p_invite_code: inviteCode,
      p_guest_name: guestName,
      p_session_token: existing?.sessionToken ?? undefined,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new GuestError('Unable to join the table.');

    const session: GuestSession = {
      participantId: row.participant_id,
      tableId: row.table_id,
      guestName: row.guest_name,
      sessionToken: row.session_token,
    };

    await guestStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function getGuestSession(): Promise<GuestSession | null> {
  try {
    const raw = await guestStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GuestSession>;

    if (!parsed.participantId || !parsed.tableId || !parsed.sessionToken) {
      return null;
    }
    return parsed as GuestSession;
  } catch {
    // Unreadable or corrupt storage is treated as "no session".
    return null;
  }
}

export async function hasGuestSession() {
  return (await getGuestSession()) !== null;
}

export async function clearGuestSession() {
  await guestStorage.removeItem(SESSION_KEY);
}

export type GuestSessionState =
  | { status: 'none' }
  | { status: 'valid'; session: GuestSession; tableStatus: string; isActive: boolean }
  | { status: 'expired' };

/**
 * Asks the server whether the stored session is still real.
 *
 * The stored ids are never trusted on their own — the token is what the
 * database looks up, and it decides which table this guest belongs to.
 */
export async function validateGuestSession(): Promise<GuestSessionState> {
  const session = await getGuestSession();
  if (!session) return { status: 'none' };

  try {
    const { data, error } = await supabase.rpc('validate_guest_session', {
      p_session_token: session.sessionToken,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { status: 'expired' };

    // Keep the local copy in step with the server's view of the name/table.
    const refreshed: GuestSession = {
      ...session,
      participantId: row.participant_id,
      tableId: row.table_id,
      guestName: row.guest_name,
    };
    await guestStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));

    return {
      status: 'valid',
      session: refreshed,
      tableStatus: row.table_status,
      isActive: row.is_active,
    };
  } catch (error) {
    const message = messageOf(error);

    // A rejected token means the session is gone; a network blip does not.
    if (message.includes('session has expired')) {
      await clearGuestSession();
      return { status: 'expired' };
    }
    throw toFriendlyError(error);
  }
}

/** Marks the guest inactive on the server, then forgets the local session. */
export async function leaveTable() {
  const session = await getGuestSession();

  try {
    if (session) {
      await supabase.rpc('leave_table', { p_session_token: session.sessionToken });
    }
  } finally {
    // The device should end up signed out of the table either way.
    await clearGuestSession();
  }
}
