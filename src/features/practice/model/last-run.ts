/**
 * The run that finished last in this tab, for /practice/results: it shows
 * that run, and after a reload (when this is empty) the newest one in the
 * history. A module of its own, so the results screen never loads the run
 * machine just to ask.
 */
let lastFinished: string | null = null;

export function rememberFinishedRun(runId: string): void {
  lastFinished = runId;
}

export function lastFinishedRunId(): string | null {
  return lastFinished;
}
