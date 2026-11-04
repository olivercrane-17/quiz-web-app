/**
 * Practice's client entry: the Quick play link, for any surface that offers
 * a practice round ("Want more? Try a practice round." on the Daily's stop
 * screen, the not-found page). Pass its label and classes from the server,
 * as Today's card does, so the island stays a click handler. While a run is
 * open it reads "Continue practice · 3 of 10" and carries that run on
 * (R1-36), so a surface that links to it never resumes a run silently, as a
 * plain link to /practice/run would.
 */
export { QuickPlayLink } from "./quick-play-link";
