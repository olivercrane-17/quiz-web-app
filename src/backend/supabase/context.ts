/**
 * What every Supabase area adapter is built with. SQL-1 adds the RPC
 * plumbing here (client.ts, rpc.ts, decode.ts: one lazily created client
 * per tab, the 8 s abort, envelope and transport mapping, server-clock
 * samples and markRegistered after the first write, §7.5).
 */
import type { BackendDeps } from "../deps";

export interface SupabaseContext {
  deps: BackendDeps;
}
