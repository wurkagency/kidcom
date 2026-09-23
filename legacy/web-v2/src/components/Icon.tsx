// Thin wrapper around the Material Symbols Outlined webfont, matching the
// `<span class="material-symbols-outlined">` pattern used throughout the
// Stitch mockups (see docs/stitch_splitkid/*/code.html).
//
// Icons here are always paired with adjacent visible text, or sit inside a
// button/link that already conveys its purpose some other way — so the icon
// itself is decorative. It's hidden from assistive tech by default so that,
// if the webfont fails to load, screen readers don't announce the raw
// ligature text (e.g. "chevron_right"). If a given icon is ever truly the
// only accessible content of a control, prefer putting an aria-label on
// that control (or pass one here) rather than relying on this default.
export function Icon({
  name,
  className = "",
  "aria-label": ariaLabel,
}: {
  name: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      aria-hidden={ariaLabel ? undefined : "true"}
      aria-label={ariaLabel}
    >
      {name}
    </span>
  );
}
