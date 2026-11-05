/**
 * The mock streaks area (ARCHITECTURE §7.4). A Wave 0 stub: every method
 * answers `unavailable` until STK-1 builds it, following the SQL rules
 * with engine code.
 */
import { unavailableArea } from "../../areas";
import type { StreakApi } from "../../types";
import type { MockContext } from "../context";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof StreakApi)[] = [];

export function createStreaksArea(_ctx: MockContext): StreakApi {
  return unavailableArea("streaks");
}
