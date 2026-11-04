/**
 * The Supabase identity adapter (ARCHITECTURE §7.2, §7.5, §8.4): one method
 * per identity RPC of supabase/migrations/20261104000400_identity.sql.
 *
 * - Credentials: methods that act for the tab's player send its id and
 *   secret (`auth: "player"`); the redemptions authenticate with the code or
 *   token they redeem, and the device sends the new secret it minted, so a
 *   secret only ever travels from the device to the server (§1.4 item 12).
 *   The caller stores the restored identity (`IdentityProvider.replace`).
 * - Writes: register, setAgeBand, createSyncCode and createClaim mark the
 *   identity registered after their first success (rpc.ts), which backs it
 *   up in the cookie (§9.1).
 * - Errors keep the server's meaning: a used or expired claim is `expired`
 *   with `current: { used }`, so the client can log `claim_link_used`
 *   with `used` or `expired`; `rate_limited` carries its wait and scope.
 * - Nothing that can only fail is sent: an Under 13 answer is never sent
 *   (§9.7), and a sync code that cannot be one fails `invalid_input`
 *   before it costs the address one of its 5 attempts (AC-SYN-04).
 * - deletePlayer answers `unavailable` with a wait until the owner applies
 *   20261104000500_identity_attended.sql (supabase/README.md §9).
 * - setNickname stays `unavailable` until MOD-1 adds `set_nickname`.
 */
import {
  parseDailyNumber,
  parseLocalDate,
  parsePlayerId,
  parseSyncCode,
  type ClaimPreview,
  type DailyIdentity,
  type PlayerId,
  type Profile,
  type RestoredProfile,
  type ServerDataExport,
} from "@/engine/types";

import { fail, unavailable } from "../errors";
import type { IdentityApi } from "../types";
import type { SupabaseContext } from "./context";
import {
  DecodeError,
  array,
  epochMs,
  integer,
  json,
  literal,
  none,
  nullable,
  object,
  parsed,
  string,
  type Decoder,
} from "./decode";
import { call, type RpcCall } from "./rpc";

/** A whole number of zero or more: streak counts. */
const count: Decoder<number> = (value, path = "") => {
  const n = integer(value, path);
  if (n < 0) throw new DecodeError(path, "a count");
  return n;
};

const playerId = parsed(parsePlayerId, "a player id");

/** Profile (§3.10), from `private.profile_json`. */
export const decodeProfile: Decoder<Profile> = object({
  playerId,
  friendlyName: string,
  nickname: nullable(string),
  ageBand: nullable(literal("13_17", "18_plus")),
  createdAt: epochMs,
});

const decodeDailyIdentity: Decoder<DailyIdentity> = object({
  dailyNumber: parsed(parseDailyNumber, "a Daily number"),
  date: parsed(parseLocalDate, "a local date"),
});

/** What a sync-code or claim restore answers, from `private.restored_json`. */
export const decodeRestored: Decoder<RestoredProfile & { playerId: PlayerId }> =
  object({
    playerId,
    profile: decodeProfile,
    streak: object({ current: count, best: count }),
    lastDaily: nullable(decodeDailyIdentity),
  });

export const decodeSyncCode = object({
  code: parsed(parseSyncCode, "a sync code"),
  createdAt: epochMs,
});

export const decodeClaim = object({ expiresAt: epochMs });

export const decodeClaimPreview: Decoder<ClaimPreview> = object({
  friendlyName: string,
  nickname: nullable(string),
  streak: count,
  lastDaily: nullable(decodeDailyIdentity),
  expiresAt: epochMs,
});

/**
 * The export, with the server's `account` block (devices, sync code and
 * claim dates, zone and first contexts) kept as sent beside the fields of
 * ServerDataExport, so a download holds everything the server keeps.
 */
export interface ServerDataExportWithAccount extends ServerDataExport {
  account?: unknown;
}

const decodeExportFields = object({
  exportedAt: epochMs,
  profile: decodeProfile,
  attempts: array(json),
  streakDays: array(json),
  groups: array(json),
  challenges: array(json),
  quizzes: array(json),
});

export const decodeExport: Decoder<ServerDataExportWithAccount> = (
  value,
  path = "",
) => {
  const fields: ServerDataExportWithAccount = decodeExportFields(value, path);
  const account = (value as { account?: unknown }).account;
  if (account !== undefined) fields.account = account;
  return fields;
};

/** The identity area over the RPC wrapper; tests pass their own `rpc`. */
export function createIdentityArea(
  ctx: SupabaseContext,
  rpc: RpcCall = call,
): IdentityApi {
  return {
    register: (browser) =>
      rpc(
        ctx,
        "register_player",
        { p_context: browser.context, p_app: browser.app },
        decodeProfile,
        { auth: "player", write: true },
      ),

    getProfile: () =>
      rpc(ctx, "get_profile", {}, decodeProfile, { auth: "player" }),

    setAgeBand: (band, moment) =>
      band === "under_13"
        ? Promise.resolve(fail("invalid_input"))
        : rpc(
            ctx,
            "set_age_band",
            { p_band: band, p_moment: moment },
            decodeProfile,
            { auth: "player", write: true },
          ),

    setNickname: () => unavailable(),

    createSyncCode: () =>
      rpc(ctx, "create_sync_code", {}, decodeSyncCode, {
        auth: "player",
        write: true,
      }),

    redeemSyncCode: (code, newSecret) => {
      const normalized = parseSyncCode(code);
      return normalized === null
        ? Promise.resolve(fail("invalid_input"))
        : rpc(
            ctx,
            "redeem_sync_code",
            { p_code: normalized, p_new_secret: newSecret },
            decodeRestored,
          );
    },

    createClaim: (token) =>
      rpc(ctx, "create_claim", { p_token: token }, decodeClaim, {
        auth: "player",
        write: true,
      }),

    peekClaim: (token) =>
      rpc(ctx, "peek_claim", { p_token: token }, decodeClaimPreview),

    redeemClaim: (token, newSecret) =>
      rpc(
        ctx,
        "redeem_claim",
        { p_token: token, p_new_secret: newSecret },
        decodeRestored,
      ),

    exportData: () =>
      rpc(ctx, "export_my_data", {}, decodeExport, { auth: "player" }),

    deletePlayer: () => rpc(ctx, "delete_player", {}, none, { auth: "player" }),
  };
}
