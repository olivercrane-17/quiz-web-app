/**
 * The mock analytics area (ARCHITECTURE §7.4). A Wave 0 stub: every method
 * answers `unavailable` until ANA-1 builds it, following the SQL rules
 * with engine code.
 */
import { unavailableArea } from "../../areas";
import type { AnalyticsApi } from "../../types";
import type { MockContext } from "../context";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof AnalyticsApi)[] = [];

export function createAnalyticsArea(_ctx: MockContext): AnalyticsApi {
  return unavailableArea("analytics");
}
