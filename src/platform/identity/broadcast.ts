/**
 * Cross-tab news of the identity (ARCHITECTURE §6.4): a tab that changes
 * `qz:identity` (a mint, a cookie restore, registration, a cookie refresh,
 * a sync-code or claim restore) posts `identity_changed` on
 * `BroadcastChannel('qz')`, and every other tab re-reads the key. The
 * `storage` event covers browsers without BroadcastChannel; a tab that
 * hears both just re-reads twice.
 *
 * A tab that forgets the identity (Delete my data, Under 13: SET-1 through
 * `forgetIdentity()`) says so in the message (`forgotten: true`), and every
 * other tab drops its copy instead of writing it back. Over `storage`
 * events the Under 13 flag (`qz:under13`) says the same.
 *
 * The channel name and message follow §6.4, so the shared
 * `src/platform/broadcast.ts` it describes can carry this message later
 * without changing what tabs say to each other.
 *
 * Device namespaces (§6.1, mock builds only) share one browser context, so
 * the message names its device and other devices ignore it.
 */

/** The app's one cross-tab channel (§6.4). */
export const QZ_CHANNEL = "qz";

export interface IdentityChangedMessage {
  type: "identity_changed";
  /** The device namespace whose `qz:identity` changed, or null. */
  device: string | null;
  /** True when the identity was forgotten: no tab may write it back. */
  forgotten?: boolean;
}

/** What a tab heard about another tab's identity. */
export interface IdentityNews {
  /** The other tab forgot the identity (Delete my data, Under 13). */
  forgotten: boolean;
}

export interface IdentityChannel {
  /** Tells the other tabs this tab's identity changed, or was forgotten. */
  announce(news?: { forgotten?: boolean }): void;
  /** Calls `onChange` when another tab's identity changed; returns the unsubscribe. */
  listen(onChange: (news: IdentityNews) => void): () => void;
  close(): void;
}

/** The slice of BroadcastChannel the identity channel uses. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  close(): void;
}

/** The slice of `window` that delivers `storage` events. */
export interface StorageEventSource {
  addEventListener(
    type: "storage",
    listener: (event: { key: string | null }) => void,
  ): void;
  removeEventListener(
    type: "storage",
    listener: (event: { key: string | null }) => void,
  ): void;
}

export interface IdentityChannelOptions {
  /** This tab's device namespace (`kv.device`). */
  device: string | null;
  /** Default: `new BroadcastChannel('qz')` where available. Null: none. */
  channel?: ChannelLike | null;
  /** Default: `window`. Null: no storage events. */
  storageEvents?: StorageEventSource | null;
}

function isIdentityChanged(data: unknown): data is IdentityChangedMessage {
  if (typeof data !== "object" || data === null) return false;
  const { type, device, forgotten } = data as Record<string, unknown>;
  return (
    type === "identity_changed" &&
    (device === null || typeof device === "string") &&
    (forgotten === undefined || typeof forgotten === "boolean")
  );
}

function browserChannel(): ChannelLike | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    const channel = new BroadcastChannel(QZ_CHANNEL);
    // Node's BroadcastChannel (unit tests) would keep the process alive.
    (channel as { unref?: () => void }).unref?.();
    return channel;
  } catch {
    return null;
  }
}

function browserWindow(): StorageEventSource | null {
  try {
    return typeof window === "undefined" ? null : window;
  } catch {
    return null;
  }
}

/**
 * True for a `storage` event that may have touched an identity key or the
 * Under 13 flag (§9.7), in any namespace, or cleared storage.
 */
function touchesIdentity(key: string | null): boolean {
  return (
    key === null ||
    (key.startsWith("qz:") &&
      (key.endsWith(":identity") || key.endsWith(":under13")))
  );
}

export function createIdentityChannel(
  options: IdentityChannelOptions,
): IdentityChannel {
  const device = options.device;
  const channel =
    options.channel === undefined ? browserChannel() : options.channel;
  const storageEvents =
    options.storageEvents === undefined
      ? browserWindow()
      : options.storageEvents;
  const listeners = new Set<(news: IdentityNews) => void>();

  const notify = (news: IdentityNews) => {
    for (const listener of [...listeners]) {
      try {
        listener(news);
      } catch {
        // One listener's bug never stops the others.
      }
    }
  };
  const onMessage = (event: { data: unknown }) => {
    if (isIdentityChanged(event.data) && event.data.device === device) {
      notify({ forgotten: event.data.forgotten === true });
    }
  };
  // The tab re-reads storage, where the Under 13 flag speaks for itself.
  const onStorage = (event: { key: string | null }) => {
    if (touchesIdentity(event.key)) notify({ forgotten: false });
  };

  try {
    channel?.addEventListener("message", onMessage);
    storageEvents?.addEventListener("storage", onStorage);
  } catch {
    // Without listeners this tab only misses other tabs' news.
  }

  return {
    announce(news = {}) {
      try {
        channel?.postMessage({
          type: "identity_changed",
          device,
          ...(news.forgotten === true ? { forgotten: true } : {}),
        } satisfies IdentityChangedMessage);
      } catch {
        // A closed channel: other tabs still get the storage event.
      }
    },
    listen(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    close() {
      listeners.clear();
      try {
        channel?.removeEventListener("message", onMessage);
        storageEvents?.removeEventListener("storage", onStorage);
        channel?.close();
      } catch {
        // Already closed.
      }
    },
  };
}
