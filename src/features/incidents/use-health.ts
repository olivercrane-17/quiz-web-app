/**
 * Extension point (ARCHITECTURE §2.3, §10.6): the client's view of service
 * health, which drives the incident banners (PRD §3.15.2), the home card's
 * outage line and offline states.
 *
 * A stub until INC-1: it always reports "ok". INC-1 replaces the body with
 * the health monitor (`src/platform/network.ts`); the signature stays.
 */
import type { ClientHealth } from "@/engine/types";

export function useServiceHealth(): ClientHealth {
  return "ok";
}
