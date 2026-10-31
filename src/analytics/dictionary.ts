/**
 * The analytics dictionary (ARCHITECTURE §3.12, PRD §7.2).
 *
 * The single source for client types, the client-side allowlist and the SQL
 * allowlist: SQL-10 generates supabase/seed/analytics-dictionary.sql from it.
 * A dictionary edit is a contract change. It needs a new SQL dictionary load
 * (SQL-10's generator) in the same pull request, and CI fails if the
 * committed SQL does not match the dictionary.
 *
 * Erasable TypeScript with no imports beyond engine types, so scripts can
 * run it under Node.
 */
import type { PlayerId } from "../engine/types/ids.ts";

const e = <const T extends readonly string[]>(...values: T) =>
  ({ kind: "enum", values }) as const;
const bool = { kind: "bool" } as const;
const num = (min: number, max: number) =>
  ({ kind: "number", min, max }) as const;
/** 'p.geo.0142' style. */
const ref = { kind: "item_ref" } as const;
/** [a-z0-9_.-], e.g. a composition id or build id. */
const word = { kind: "token", max: 48 } as const;
const hex16 = { kind: "hex", length: 16 } as const;
const numOrNone = (min: number, max: number) =>
  ({ kind: "number_or_none", min, max }) as const;

const MODE = e(
  "daily",
  "archive",
  "practice",
  "blitz",
  "survival",
  "review",
  "challenge",
  "room",
  "quiz",
);
const APP = e(
  "whatsapp",
  "instagram",
  "facebook",
  "messenger",
  "tiktok",
  "snapchat",
  "linkedin",
  "telegram",
  "google",
  "other",
  "none",
);
const OFFER = e(
  "repair",
  "claim",
  "sync",
  "install",
  "calendar",
  "group",
  "none",
);
const SURFACE = e(
  "stop",
  "home",
  "archive",
  "practice",
  "challenge",
  "group_invite",
  "quiz",
  "head_to_head",
);
const TRIGGER = e(
  "third_daily",
  "first_quiz",
  "in_app_first",
  "private_first",
  "pre_install",
  "tenth_daily",
  "manual",
);

export const EVENTS = {
  landing_view: {
    entry: e(
      "direct",
      "share",
      "challenge",
      "group_invite",
      "room",
      "quiz",
      "search",
      "installed",
      "other",
    ),
    app: APP,
  },
  first_answer: { mode: MODE },
  practice_start: {
    mode: MODE,
    category: word,
    difficulty: e("easy", "medium", "hard", "mixed", "ramp"),
  },
  run_complete: {
    mode: MODE,
    score_band: e("0-3", "4-6", "7-9", "10-12", "7-8", "9-10", "na"),
    composition: word,
  },
  results_view: { mode: MODE },
  stop_screen_view: {
    first_view: bool,
    offer: OFFER,
    comparison: e("head_to_head", "shared_result", "none"),
    groups_shown: e("0", "1", "2", "3+"),
  },
  offer_action: { offer: OFFER, action: e("accept", "dismiss") },
  how_to_play_open: { round: numOrNone(1, 10), first_daily: bool },
  mystery_input: {
    round: num(1, 3),
    typed: bool,
    suggestions_shown: bool,
    resolution: e("guess", "option", "missed"),
    first_keystroke_s: e("0-5", "5-15", "15-30", "30+", "none"),
  },
  suggestion_none: { answer_type: word, query_len: e("3-5", "6-10", "11+") },
  share_open: { mode: MODE, surface: SURFACE },
  share_complete: {
    method: e("native", "clipboard", "manual"),
    mode: MODE,
    surface: SURFACE,
  },
  share_cancel: { mode: MODE, surface: SURFACE },
  challenge_open: {
    state: e("valid", "expired", "full", "not_open", "invalid"),
    relation: e("new", "already_played", "self"),
  },
  group_invite_open: { state: e("valid", "full", "invalid") },
  room_join: {
    result: e("ok", "full", "locked", "bad_code", "rate_limited"),
    method: e("qr", "code"),
    phase: e("lobby", "in_game"),
    name: e("generated", "typed"),
  },
  room_disconnect: {
    reason: e("heartbeat_timeout", "offline", "hidden", "removed", "ended"),
    duration_s: e("0-10", "10-60", "60+"),
  },
  realtime_fallback: { reason: e("channel_error", "late_phase") },
  read_beat_skip: { slot: num(1, 50) },
  explanation_dwell: {
    mode: MODE,
    seconds: e("0-2", "2-5", "5-10", "10-20", "20+"),
  },
  question_heart: { item_id: ref, mode: MODE, value: e("on", "off") },
  report_open: {
    mode: MODE,
    round_type: e("mystery", "encore", "choice", "room", "quiz"),
  },
  sync_code_offer: { trigger: TRIGGER },
  sync_code_saved: { trigger: TRIGGER, method: e("copy", "confirm") },
  sync_code_redeem: {
    result: e("ok", "bad", "rate_limited"),
    replaced_progress: bool,
  },
  claim_link_offer: { app: APP },
  claim_link_used: { app: APP, result: e("ok", "expired", "used") },
  identity_restored: { source: e("cookie", "sync_code", "claim") },
  storage_lost: {},
  install_prompt_shown: {},
  install_accepted: {},
  calendar_add: { method: e("google", "ics") },
  /** Under 13 sends nothing. */
  age_band_set: {
    band: e("13_17", "18_plus"),
    moment: e("nickname", "group", "reminder", "quiz_share", "room_name"),
  },
  settings_change: {
    setting: e(
      "theme",
      "motion",
      "sound",
      "haptics",
      "readable_text",
      "high_contrast",
      "read_aloud",
      "stopwatch",
      "shortcuts",
      "auto_advance",
      "timer_announcements",
      "display_name",
    ),
    value: e(
      "system",
      "light",
      "dark",
      "on",
      "off",
      "shown",
      "hidden",
      "generated",
      "custom",
    ),
  },
  offline_state_shown: {
    feature: e(
      "daily",
      "archive",
      "challenge",
      "group",
      "room",
      "quiz",
      "restore",
    ),
  },
  incident_banner_shown: {
    state: e("degraded", "outage", "unreachable", "maintenance", "content_fix"),
  },
  survey_answer: {
    question_id: e("regret_v1"),
    answer: e("yes", "no", "not_sure", "dismissed"),
  },
  web_vitals: {
    metric: e("LCP", "INP", "CLS", "FCP", "TTFB", "Q1", "NEXT"),
    value: num(0, 600_000),
    rating: e("good", "needs_improvement", "poor"),
  },
  /** server: onRequestError. */
  client_error: {
    kind: e("error", "rejection", "rpc", "server"),
    message_hash: hex16,
    rpc: word,
    code: word,
  },
  sw_update_applied: { from_version: word, to_version: word },
} as const;

/** The value spec of one event property. */
export type PropSpec =
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "bool" }
  | { readonly kind: "number"; readonly min: number; readonly max: number }
  | {
      readonly kind: "number_or_none";
      readonly min: number;
      readonly max: number;
    }
  | { readonly kind: "item_ref" }
  | { readonly kind: "token"; readonly max: number }
  | { readonly kind: "hex"; readonly length: number };

/**
 * `enum` maps to its literal union, `bool` to boolean, `number` to number,
 * `number_or_none` to number | 'none' and the string kinds to string.
 */
export type PropValue<S> = S extends {
  kind: "enum";
  values: readonly (infer V)[];
}
  ? V
  : S extends { kind: "bool" }
    ? boolean
    : S extends { kind: "number" }
      ? number
      : S extends { kind: "number_or_none" }
        ? number | "none"
        : S extends { kind: "item_ref" | "token" | "hex" }
          ? string
          : never;

export type EventName = keyof typeof EVENTS;
export type EventProps<N extends EventName> = {
  [K in keyof (typeof EVENTS)[N]]: PropValue<(typeof EVENTS)[N][K]>;
};

export type RouteGroup =
  | "home"
  | "daily"
  | "archive"
  | "practice"
  | "challenge"
  | "share"
  | "group"
  | "me"
  | "settings"
  | "room"
  | "host"
  | "editor"
  | "quiz"
  | "category"
  | "legal"
  | "other";
export type Platform = "ios" | "android" | "desktop" | "other";
export type BrowserContextKind = "browser" | "installed" | "in_app" | "unknown";

/** Added by the client queue to every event. No free text, IP, user agent or referrer value. */
export interface EventEnvelope {
  /** UUID, unique constraint server-side. */
  event_id: string;
  name: EventName;
  player_id: PlayerId;
  /** Random per tab. */
  session_id: string;
  /** ISO 8601. */
  ts_client: string;
  app_version: string;
  route_group: RouteGroup;
  platform: Platform;
  context: BrowserContextKind;
}

/**
 * The item references analytics may carry: practice items ('p.geo.0142',
 * fixtures included) and the public refs of HeartInput ('daily:42:2',
 * 'room:<roomId>:7', 'quiz:<code>:3'). Sealed ids never appear (§5.4).
 */
const ITEM_REF =
  /^(?:(?:fx\.)?p\.[a-z]+\.\d{4}|daily:\d{1,5}:\d{1,2}|room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d{1,2}|quiz:[0-9A-Z]{10}:\d{1,3})$/;
const TOKEN = /^[a-z0-9_.-]+$/;
const HEX = /^[0-9a-f]+$/;

export function isEventName(name: unknown): name is EventName {
  return typeof name === "string" && Object.hasOwn(EVENTS, name);
}

/** True when `value` is allowed by `spec`. */
export function isAllowedValue(spec: PropSpec, value: unknown): boolean {
  switch (spec.kind) {
    case "enum":
      return typeof value === "string" && spec.values.includes(value);
    case "bool":
      return typeof value === "boolean";
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= spec.min &&
        value <= spec.max
      );
    case "number_or_none":
      return (
        value === "none" ||
        (typeof value === "number" &&
          Number.isFinite(value) &&
          value >= spec.min &&
          value <= spec.max)
      );
    case "item_ref":
      return typeof value === "string" && ITEM_REF.test(value);
    case "token":
      return (
        typeof value === "string" &&
        value.length >= 1 &&
        value.length <= spec.max &&
        TOKEN.test(value)
      );
    case "hex":
      return (
        typeof value === "string" &&
        value.length === spec.length &&
        HEX.test(value)
      );
  }
}

export type PropsCheck =
  | { ok: true }
  | {
      ok: false;
      problem: "unknown_event" | "missing" | "extra" | "invalid";
      prop: string | null;
    };

/**
 * The client-side allowlist: an event's props must hold exactly the keys
 * its dictionary entry names, each with an allowed value. Nothing else
 * leaves the device.
 */
export function checkEventProps(name: unknown, props: unknown): PropsCheck {
  if (!isEventName(name))
    return { ok: false, problem: "unknown_event", prop: null };
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    return { ok: false, problem: "invalid", prop: null };
  }
  const specs: Readonly<Record<string, PropSpec>> = EVENTS[name];
  const values = props as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(specs, key))
      return { ok: false, problem: "extra", prop: key };
  }
  for (const [key, spec] of Object.entries(specs)) {
    if (!Object.hasOwn(values, key))
      return { ok: false, problem: "missing", prop: key };
    if (!isAllowedValue(spec, values[key])) {
      return { ok: false, problem: "invalid", prop: key };
    }
  }
  return { ok: true };
}
