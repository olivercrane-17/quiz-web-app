/**
 * The mock identity area (ARCHITECTURE §7.4). A Wave 0 stub: every method
 * answers `unavailable` until DLY-1 (register on first write), then IDN-1 and IDN-2 builds it, following the SQL rules
 * with engine code.
 */
import { unavailableArea } from "../../areas";
import type { IdentityApi } from "../../types";
import type { MockContext } from "../context";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof IdentityApi)[] = [];

export function createIdentityArea(_ctx: MockContext): IdentityApi {
  return unavailableArea("identity");
}
