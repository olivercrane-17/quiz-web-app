/**
 * Practice's client entry: the Quick play link, for a surface that offers
 * a practice round in one tap (the not-found page, say). Pass its label and
 * classes from the server, as Today's card does, so the island stays a
 * click handler. While a run is open it reads "Continue practice · 3 of 10"
 * and carries that run on (R1-36), so a surface that links to it never
 * resumes a run silently, as a plain link to /practice/run would. The
 * Daily's Practice links go to the hub, /practice, instead, which keeps
 * the stop screen's own words ("Want more? Try a practice round.").
 */
export { QuickPlayLink } from "./quick-play-link";
