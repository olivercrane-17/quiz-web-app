/**
 * Room hints for the mock (ARCHITECTURE §7.4, §8.11): what Supabase
 * Realtime's private room channels carry, `{ room, phase, version,
 * deadline }` on topic `room:<id>` (players) or `roomhost:<id>` (the host),
 * sent on `BroadcastChannel('qz-mock-rt')` so several pages in one browser
 * context play one room (AC-ROM-01 in mock form).
 *
 * Hints are hints only: subscribers refetch state when one arrives and poll
 * as a fallback, so a lost hint costs a little latency and nothing else.
 * `setState('down')` stops hints in both directions and tells every
 * subscriber `down` (the AC-ROM-03 switch); `live` reconnects them.
 *
 * ROM-1 builds `rooms.subscribe` on it; the context's `emitHint` sends
 * through it.
 */
import type { RoomHint } from "@/engine/types";

import type { MockChannelLike } from "./store";

/** The channel room hints travel on. */
export const MOCK_REALTIME_CHANNEL = "qz-mock-rt";

export type RealtimeStatus = "live" | "down";

export interface RealtimeHandlers {
  hint(hint: RoomHint): void;
  status(status: RealtimeStatus): void;
}

export interface MockRealtime {
  /** Sends a hint on a topic: this tab's subscribers and every other tab's. */
  emit(topic: string, hint: RoomHint): void;
  /** Hints for one topic; the status is reported at once and on every change. */
  subscribe(topic: string, handlers: RealtimeHandlers): () => void;
  setState(state: RealtimeStatus): void;
  state(): RealtimeStatus;
  close(): void;
}

interface HintMessage {
  type: "hint";
  topic: string;
  hint: RoomHint;
}

function isHintMessage(data: unknown): data is HintMessage {
  if (typeof data !== "object" || data === null) return false;
  const { type, topic, hint } = data as Record<string, unknown>;
  return (
    type === "hint" &&
    typeof topic === "string" &&
    typeof hint === "object" &&
    hint !== null
  );
}

function browserChannel(): MockChannelLike | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    const channel = new BroadcastChannel(MOCK_REALTIME_CHANNEL);
    (channel as { unref?: () => void }).unref?.();
    return channel;
  } catch {
    return null;
  }
}

export function createMockRealtime(
  options: { channel?: MockChannelLike | null; state?: RealtimeStatus } = {},
): MockRealtime {
  let channel: MockChannelLike | null | undefined = options.channel;
  let listening = false;
  let current: RealtimeStatus = options.state ?? "live";
  const subscribers = new Map<string, Set<RealtimeHandlers>>();

  const deliver = (topic: string, hint: RoomHint) => {
    if (current === "down") return;
    for (const handlers of [...(subscribers.get(topic) ?? [])]) {
      try {
        handlers.hint(hint);
      } catch {
        // One subscriber's bug never stops the others.
      }
    }
  };

  /** Opened on first use, so a page without rooms never opens a channel. */
  const open = (): MockChannelLike | null => {
    channel ??= browserChannel();
    if (channel !== null && !listening) {
      listening = true;
      channel.addEventListener("message", (event) => {
        if (isHintMessage(event.data)) {
          deliver(event.data.topic, event.data.hint);
        }
      });
    }
    return channel;
  };

  return {
    emit(topic, hint) {
      if (current === "down") return;
      deliver(topic, hint);
      try {
        open()?.postMessage({
          type: "hint",
          topic,
          hint,
        } satisfies HintMessage);
      } catch {
        // A closed channel drops the hint; polling covers it.
      }
    },
    subscribe(topic, handlers) {
      open();
      let set = subscribers.get(topic);
      if (set === undefined) {
        set = new Set();
        subscribers.set(topic, set);
      }
      set.add(handlers);
      // The status as it is when the report goes out, not as it was here: a
      // setState() in between has already told this subscriber, and a stale
      // "live" heard last would switch off its polling fallback (AC-ROM-03).
      queueMicrotask(() => {
        if (subscribers.get(topic)?.has(handlers)) handlers.status(current);
      });
      return () => {
        const remaining = subscribers.get(topic);
        remaining?.delete(handlers);
        if (remaining?.size === 0) subscribers.delete(topic);
      };
    },
    setState(state) {
      if (state === current) return;
      current = state;
      for (const set of subscribers.values()) {
        for (const handlers of [...set]) {
          try {
            handlers.status(state);
          } catch {
            // As above.
          }
        }
      }
    },
    state: () => current,
    close() {
      subscribers.clear();
      try {
        channel?.close();
      } catch {
        // Already closed.
      }
      channel = null;
    },
  };
}
