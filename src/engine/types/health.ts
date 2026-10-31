/**
 * Service health (ARCHITECTURE §3.10).
 */
import type { DailyNumber, EpochMs, LocalDate } from "./ids.ts";

export type ServiceState = "ok" | "degraded" | "outage" | "maintenance";
export type ClientHealth =
  ServiceState | "unreachable" | "offline" | "unavailable";
export interface ServiceStatus {
  state: ServiceState;
  messageId: string | null;
  startsAt: EpochMs | null;
  endsAt: EpochMs | null;
  /** Recent incident dates, for the one-time notice. */
  protectedDates: LocalDate[];
  contentFix: { dailyNumber: DailyNumber } | null;
  serverTime: EpochMs;
}
