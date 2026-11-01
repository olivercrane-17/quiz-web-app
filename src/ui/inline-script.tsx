/**
 * An inline script that runs while the HTML parses, before first paint
 * (Next's "preventing flash before hydration" guide). React warns about
 * script tags it renders on the client, so the client render marks it
 * `text/plain`; the attribute mismatch is suppressed. Scripts inserted on
 * a client navigation never run either way, so whatever the script fills
 * must also be filled by a client component.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** JSON for a script body: `<` escaped, so no value can close the tag. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
