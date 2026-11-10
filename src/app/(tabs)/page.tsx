/** Today, `/` (ARCHITECTURE §10.1): a static shell whose islands come from the home slots. */
import type { Metadata } from "next";

import { TODAY_METADATA } from "@/features/shell/routes/today-metadata";

export { default } from "@/features/home/routes/home";

/** "Today · Knewt" (R3-08). */
export const metadata: Metadata = TODAY_METADATA;
