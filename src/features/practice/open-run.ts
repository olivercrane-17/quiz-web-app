/**
 * What Quick play says while a practice run is open (R1-36): "Continue
 * practice · 3 of 10", for the run /practice/run would carry on. Loaded
 * after first paint in its own chunk, so Today's Quick play island stays a
 * click handler (§10.9 item 2), and only after the client boot, as every
 * island that reads storage waits for it (§6.1).
 */
import { bootClient } from "@/features/identity";
import { getKv } from "@/platform/storage";

import { PRACTICE_CLIENT_COPY } from "./client-copy";
import { openRun, runProgress } from "./model/storage";
import { sessionTabRun } from "./model/tab-run";

/** Null when no run is open, so Quick play starts one. */
export async function openRunLabel(): Promise<string | null> {
  await bootClient();
  const run = openRun(getKv(), sessionTabRun.runId());
  if (run === null) return null;
  const { question, total } = runProgress(run);
  return PRACTICE_CLIENT_COPY.continuePractice(question, total);
}
