// Validates a `?redirect=` query value before handing it to navigate()/Link.
//
// `value.startsWith("/")` alone is NOT sufficient: "//evil.com" also starts
// with "/" but is a protocol-relative URL, and "/\evil.com" is normalized by
// the browser's own URL parser to the same thing (backslash is treated as
// forward slash in the path/authority of a special-scheme URL per the WHATWG
// URL Standard) — this is exactly the open-redirect class covered by
// react-router's own advisory for backslash-based bypasses in <Link>/
// useNavigate. Resolving through the real URL parser and comparing origins
// reproduces the browser's own normalization instead of re-guessing it with
// string prefixes, so it can't be bypassed by a variant we didn't think of.
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  let resolved: URL;
  try {
    resolved = new URL(value, window.location.origin);
  } catch {
    return null;
  }
  if (resolved.origin !== window.location.origin) return null;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
