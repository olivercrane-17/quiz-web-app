/**
 * Whether a restore left Today a note (`restore-notice.ts`), in the fewest
 * bytes: Today's first load carries this module, and nothing more, until a
 * note is waiting (ARCHITECTURE §10.9 item 2).
 */

/** Session storage, this tab only. */
export const RESTORE_NOTICE_KEY = "qz:restore-notice";

/** True when a note is waiting, without taking it. */
export function hasRestoreNotice(): boolean {
  try {
    return (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(RESTORE_NOTICE_KEY) !== null
    );
  } catch {
    return false;
  }
}
