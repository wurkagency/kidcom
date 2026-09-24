// Security headers for the app's pages — the single source of truth.
// Production: nginx sends these on every page (docs/deployment_guide.md
// §5.5 copies them — keep the two in sync). Locally, `npm run preview
// --workspace=apps/web` serves the built app with them, so a CSP problem
// shows up before it ships. The API sets its own headers (helmet).
//
// Why each CSP source is needed:
// - script-src 'self': the build has no inline scripts.
// - style-src 'unsafe-inline': sonner (toasts) and Radix dialogs'
//   scroll-lock inject <style> tags at runtime. Scripts stay strict.
// - img-src/media-src blob:: previews of photos and videos before upload.
// - img-src/font-src data:: small images and font subsets the build inlines
//   into the CSS (a font can't run script).
// - No 'unsafe-eval': Zod runs jitless (packages/theme-kit/src/manifest.ts).
// - frame-ancestors 'none': nobody may frame the app (clickjacking of
//   "Delete account", "Cancel subscription", relationship changes).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
