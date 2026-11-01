/**
 * The param of a rewritten per-user path (ARCHITECTURE §10.1). The shells
 * have no dynamic segment, so the param comes from the browser's pathname:
 * `matchPathParam("/g/:groupId", "/g/0f8fad5b")` is `"0f8fad5b"`. Pure and
 * framework-free; the shell's `usePathParam()` hook (`@/features/shell`)
 * feeds it the router's pathname on every navigation, because Next reuses
 * one mounted shell for every id.
 */

/**
 * The value of `source`'s one `:param` segment when `pathname` matches the
 * pattern segment for segment (a trailing slash is ignored), else null. A
 * pattern with no param, or with several, matches nothing. The value is
 * URI-decoded; one that doesn't decode, or that is empty, is no match.
 */
export function matchPathParam(
  source: string,
  pathname: string | null,
): string | null {
  if (pathname === null) return null;
  const pattern = source.split("/");
  if (pattern.filter((part) => part.startsWith(":")).length !== 1) return null;
  const parts = (
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  ).split("/");
  if (parts.length !== pattern.length) return null;
  let value: string | null = null;
  for (const [index, want] of pattern.entries()) {
    const got = parts[index] ?? "";
    if (!want.startsWith(":")) {
      if (got !== want) return null;
      continue;
    }
    if (got === "") return null;
    try {
      value = decodeURIComponent(got);
    } catch {
      return null;
    }
  }
  return value === "" ? null : value;
}
