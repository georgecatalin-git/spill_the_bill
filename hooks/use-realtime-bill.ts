import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * The one place this app talks to Supabase Realtime.
 *
 * A message never carries bill data — only "bill X moved". Whoever receives it
 * re-reads the authoritative state through the path they are already allowed
 * to use: the admin through RLS, a guest through the `get_guest_*` functions.
 * That is deliberate. One person claiming an item changes what OTHER people
 * owe, because a shared line is re-divided by largest remainder between
 * everyone on it; merging a claim row into local state would mean working out
 * those figures on the device, and the database owns every number.
 *
 * So this hook does not hold bill state. It holds the subscription, and calls
 * back when something needs reloading. Both `useAdminBill` and `useGuestBill`
 * already reload authoritatively after their own mutations, and that same
 * reload is what runs here.
 */

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/** What the database sends. A signal, not content. */
type ChangePayload = {
  bill_id?: string;
  table_id?: string;
  source: 'bills' | 'bill_items' | 'item_claims' | 'participants' | 'tables';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
};

/** A burst of writes lands as several messages; reload once for the lot. */
const COALESCE_MS = 150;

function log(message: string, ...rest: unknown[]) {
  // Never a token, a key or a session: these carry topics and event names only.
  if (__DEV__) console.log(`[realtime] ${message}`, ...rest);
}

// ---------------------------------------------------------------------------
// One channel per topic, shared by everyone watching it
//
// Two screens can be mounted on the same bill at once — expo-router keeps the
// previous screen alive when you push — and React remounts effects in
// development. Both would otherwise open a second subscription to the same
// topic. Reference counting keeps it at exactly one, and closes it when the
// last watcher goes.
// ---------------------------------------------------------------------------

type Subscription = {
  channel: RealtimeChannel;
  events: Set<(payload: ChangePayload) => void>;
  statuses: Set<(status: ConnectionStatus) => void>;
  watchers: number;
  status: ConnectionStatus;
  /** Once true, a later failure is a reconnection rather than a bad start. */
  everConnected: boolean;
};

const subscriptions = new Map<string, Subscription>();

function statusFor(raw: string, everConnected: boolean): ConnectionStatus {
  switch (raw) {
    case 'SUBSCRIBED':
      return 'connected';
    case 'TIMED_OUT':
      return 'reconnecting';
    case 'CHANNEL_ERROR':
      // supabase-js rejoins on its own; only a first attempt is a real failure.
      return everConnected ? 'reconnecting' : 'error';
    case 'CLOSED':
      return everConnected ? 'reconnecting' : 'disconnected';
    default:
      return 'connecting';
  }
}

function join(
  topic: string,
  onEvent: (payload: ChangePayload) => void,
  onStatus: (status: ConnectionStatus) => void
) {
  let entry = subscriptions.get(topic);

  if (!entry) {
    const created: Subscription = {
      channel: supabase.channel(topic),
      events: new Set(),
      statuses: new Set(),
      watchers: 0,
      status: 'connecting',
      everConnected: false,
    };

    // Registered before subscribing, so the status callback can tell whether
    // it still speaks for the live entry.
    log(`subscribing to ${topic}`);
    subscriptions.set(topic, created);

    created.channel
      .on('broadcast', { event: '*' }, (message) => {
        const payload = message.payload as ChangePayload;
        log(`event on ${topic}: ${payload.source} ${payload.event}`);
        created.events.forEach((listener) => listener(payload));
      })
      .subscribe((raw) => {
        // Removing a channel makes it report CLOSED on the way out. Nobody is
        // listening by then and it is not a disconnection worth announcing.
        if (subscriptions.get(topic) !== created) return;

        if (raw === 'SUBSCRIBED') created.everConnected = true;

        created.status = statusFor(raw, created.everConnected);
        log(`${topic} -> ${created.status}`);
        created.statuses.forEach((listener) => listener(created.status));
      });

    entry = created;
  }

  entry.events.add(onEvent);
  entry.statuses.add(onStatus);
  entry.watchers += 1;
  onStatus(entry.status);

  return () => {
    const current = subscriptions.get(topic);
    if (!current) return;

    current.events.delete(onEvent);
    current.statuses.delete(onStatus);
    current.watchers -= 1;

    if (current.watchers <= 0) {
      log(`unsubscribing from ${topic}`);
      subscriptions.delete(topic);
      supabase.removeChannel(current.channel);
    }
  };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

type Options = {
  /**
   * Reloads the authoritative state. Called after a change lands, after a
   * reconnection, and when the app comes back to the foreground.
   */
  onChange: () => void | Promise<void>;
  /** Drops messages for anything else, so a stale channel cannot bleed through. */
  accept?: (payload: ChangePayload) => boolean;
};

function useRealtimeTopic(topic: string | undefined, { onChange, accept }: Options) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    topic ? 'connecting' : 'disconnected'
  );

  // Kept in refs so a caller passing a fresh closure every render does not
  // tear the subscription down and build it again.
  const changeRef = useRef(onChange);
  const acceptRef = useRef(accept);
  changeRef.current = onChange;
  acceptRef.current = accept;

  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const queued = useRef(false);
  const wasConnected = useRef(false);

  /** One reload at a time; anything that arrives meanwhile earns one more run. */
  const refresh = useCallback(async () => {
    if (!alive.current) return;

    if (running.current) {
      queued.current = true;
      return;
    }

    running.current = true;
    try {
      await changeRef.current();
    } finally {
      running.current = false;

      if (queued.current && alive.current) {
        queued.current = false;
        refresh();
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      refresh();
    }, COALESCE_MS);
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!topic) {
      setConnectionStatus('disconnected');
      return;
    }

    wasConnected.current = false;

    const leave = join(
      topic,
      (payload) => {
        if (acceptRef.current && !acceptRef.current(payload)) return;
        scheduleRefresh();
      },
      (status) => {
        setConnectionStatus(status);

        // Coming back after a drop: things may have changed while we were away,
        // and no message was kept for us. Re-read rather than assume.
        if (status === 'connected' && wasConnected.current) {
          log(`${topic} reconnected — resyncing`);
          scheduleRefresh();
        }

        if (status === 'connected') wasConnected.current = true;
      }
    );

    return leave;
  }, [topic, scheduleRefresh]);

  // Phones suspend sockets in the background, and the channel can come back
  // dead without ever reporting an error. A foreground is a reason to re-read.
  useEffect(() => {
    if (!topic) return;

    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        log(`app foregrounded — resyncing ${topic}`);
        scheduleRefresh();
      }
    });

    return () => listener.remove();
  }, [topic, scheduleRefresh]);

  return { connectionStatus, refresh };
}

/**
 * Live updates for one bill.
 *
 * Pass the bill id once it is known — the first authoritative load has to
 * happen anyway, and it is what tells us which bill this is. Passing
 * `undefined` simply does not subscribe, so the caller needs no guard.
 */
export function useRealtimeBill(billId: string | undefined, onChange: () => void | Promise<void>) {
  return useRealtimeTopic(billId ? `bill:${billId}` : undefined, {
    onChange,
    // Belt and braces against a message from a channel we are leaving.
    accept: (payload) => payload.bill_id === billId,
  });
}

/**
 * Live updates for a table before its bill exists: people arriving, and the
 * moment the admin opens the receipt.
 */
export function useRealtimeTable(
  tableId: string | undefined,
  onChange: () => void | Promise<void>
) {
  return useRealtimeTopic(tableId ? `table:${tableId}` : undefined, {
    onChange,
    accept: (payload) => payload.table_id === tableId,
  });
}
