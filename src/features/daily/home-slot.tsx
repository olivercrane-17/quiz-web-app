/**
 * Extension point (ARCHITECTURE §2.3): Today's daily slot, composed by
 * src/features/home/sections.tsx. It holds the Daily ticket (PRD §3.1.7,
 * DESIGN §12.1), first on Today. In its offline state (DLY-2) it renders an
 * element with data-home-promote="practice", which moves the Practice card
 * above it (HOME_PROMOTE_PRACTICE in @/features/home).
 *
 * DLY-1 builds the not started, in progress and finished states; DLY-2
 * every state of PRD §3.1.7. The slot itself stays a server component that
 * reads the epoch and `daily_minutes` from config and hands them to the
 * card as props, so no config or engine code ships in the card. The card
 * loads with dynamic() from `home-loader.tsx` (the Daily card is one of
 * Home's eager islands, with a 4 kB gzipped target, §10.9 item 2), and
 * loads its own data after first paint.
 */
import { DAILY_EPOCH } from "@/config/shared";
import { TUNABLES } from "@/config/tunables";

import { DailyCardLoader } from "./home-loader";

export function DailyHomeSlot() {
  return (
    <DailyCardLoader epoch={DAILY_EPOCH} minutes={TUNABLES.daily.minutes} />
  );
}
