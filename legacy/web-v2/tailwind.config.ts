import type { Config } from "tailwindcss";

// Design tokens sourced from docs/Themes/Aura/haven_aura/DESIGN.md (the
// "Haven Aura" design system — Aura is the app's single theme, see
// packages/shared/src/skins.ts). Values below resolve through CSS custom
// properties defined in src/index.css's :root block — keep the property
// names in sync with that file when adding or renaming a token.
function withOpacity(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: withOpacity("--color-surface"),
        "surface-dim": withOpacity("--color-surface-dim"),
        "surface-bright": withOpacity("--color-surface-bright"),
        "surface-container-lowest": withOpacity("--color-surface-container-lowest"),
        "surface-container-low": withOpacity("--color-surface-container-low"),
        "surface-container": withOpacity("--color-surface-container"),
        "surface-container-high": withOpacity("--color-surface-container-high"),
        "surface-container-highest": withOpacity("--color-surface-container-highest"),
        "on-surface": withOpacity("--color-on-surface"),
        "on-surface-variant": withOpacity("--color-on-surface-variant"),
        "inverse-surface": withOpacity("--color-inverse-surface"),
        "inverse-on-surface": withOpacity("--color-inverse-on-surface"),
        outline: withOpacity("--color-outline"),
        "outline-variant": withOpacity("--color-outline-variant"),
        "surface-tint": withOpacity("--color-surface-tint"),
        primary: withOpacity("--color-primary"),
        "on-primary": withOpacity("--color-on-primary"),
        "primary-container": withOpacity("--color-primary-container"),
        "on-primary-container": withOpacity("--color-on-primary-container"),
        "inverse-primary": withOpacity("--color-inverse-primary"),
        secondary: withOpacity("--color-secondary"),
        "on-secondary": withOpacity("--color-on-secondary"),
        "secondary-container": withOpacity("--color-secondary-container"),
        "on-secondary-container": withOpacity("--color-on-secondary-container"),
        tertiary: withOpacity("--color-tertiary"),
        "on-tertiary": withOpacity("--color-on-tertiary"),
        "tertiary-container": withOpacity("--color-tertiary-container"),
        "on-tertiary-container": withOpacity("--color-on-tertiary-container"),
        error: withOpacity("--color-error"),
        "on-error": withOpacity("--color-on-error"),
        "error-container": withOpacity("--color-error-container"),
        "on-error-container": withOpacity("--color-on-error-container"),
        "primary-fixed": withOpacity("--color-primary-fixed"),
        "primary-fixed-dim": withOpacity("--color-primary-fixed-dim"),
        "on-primary-fixed": withOpacity("--color-on-primary-fixed"),
        "on-primary-fixed-variant": withOpacity("--color-on-primary-fixed-variant"),
        "secondary-fixed": withOpacity("--color-secondary-fixed"),
        "secondary-fixed-dim": withOpacity("--color-secondary-fixed-dim"),
        "on-secondary-fixed": withOpacity("--color-on-secondary-fixed"),
        "on-secondary-fixed-variant": withOpacity("--color-on-secondary-fixed-variant"),
        "tertiary-fixed": withOpacity("--color-tertiary-fixed"),
        "tertiary-fixed-dim": withOpacity("--color-tertiary-fixed-dim"),
        "on-tertiary-fixed": withOpacity("--color-on-tertiary-fixed"),
        "on-tertiary-fixed-variant": withOpacity("--color-on-tertiary-fixed-variant"),
        background: withOpacity("--color-background"),
        "on-background": withOpacity("--color-on-background"),
        "surface-variant": withOpacity("--color-surface-variant"),
        "growth-green": withOpacity("--color-growth-green"),
        "journal-peach": withOpacity("--color-journal-peach"),
        "alert-soft-red": withOpacity("--color-alert-soft-red"),
        "surface-beige": withOpacity("--color-surface-beige"),
        "text-main": withOpacity("--color-text-main"),
        "category-school": withOpacity("--color-category-school"),
        "on-category-school": withOpacity("--color-on-category-school"),
        "category-activity": withOpacity("--color-category-activity"),
        "on-category-activity": withOpacity("--color-on-category-activity"),
        "nav-surface": withOpacity("--color-nav-surface"),
        "nav-icon": withOpacity("--color-nav-icon"),
        "nav-icon-active": withOpacity("--color-nav-icon-active"),
        "nav-active-chip": withOpacity("--color-nav-active-chip"),

        // shadcn/ui bridge — several components (Card, Toggle, SegmentedControl,
        // FormInput, Banner, Avatar, AssignSheet, and others) are built on shadcn/ui
        // primitives. Rather than let shadcn's own HSL --background/--foreground/etc.
        // variable convention exist alongside this project's RGB-triplet --color-*
        // system, these are the exact key names shadcn's generated component source
        // expects, pointed at the closest existing token via the same withOpacity()
        // bridge every other color already uses. No new CSS variables.
        // "background"/"on-background" already exist above — reused as-is, not
        // redefined, to avoid a duplicate key. "foreground" is new.
        foreground: withOpacity("--color-on-background"),
        card: withOpacity("--color-surface-container-lowest"),
        "card-foreground": withOpacity("--color-on-surface"),
        popover: withOpacity("--color-surface-container-lowest"),
        "popover-foreground": withOpacity("--color-on-surface"),
        // Not redefining "secondary" — it already exists above (--color-secondary) and
        // every skin already varies it correctly. Just adding the "-foreground" pairing
        // shadcn's generated component source expects but this project never needed.
        "secondary-foreground": withOpacity("--color-on-secondary"),
        muted: withOpacity("--color-surface-container"),
        "muted-foreground": withOpacity("--color-on-surface-variant"),
        accent: withOpacity("--color-surface-container-high"),
        "accent-foreground": withOpacity("--color-on-surface"),
        destructive: withOpacity("--color-error"),
        "destructive-foreground": withOpacity("--color-on-error"),
        border: withOpacity("--color-outline-variant"),
        input: withOpacity("--color-outline-variant"),
        ring: withOpacity("--color-primary"),
      },
      fontFamily: {
        "display-lg": ["var(--font-heading)"],
        "headline-lg": ["var(--font-heading)"],
        "headline-lg-mobile": ["var(--font-heading)"],
        "headline-md": ["var(--font-heading)"],
        "headline-sm": ["var(--font-heading)"],
        "title-md": ["var(--font-heading)"],
        "label-md": ["var(--font-heading)"],
        "label-sm": ["var(--font-heading)"],
        "micro-meta": ["var(--font-heading)"],
        "body-lg": ["var(--font-body)"],
        "body-md": ["var(--font-body)"],
      },
      // Every size/line-height/letter-spacing/weight resolves through a CSS
      // custom property (src/index.css) so a skin can override its whole
      // type scale at runtime, the same way colors/radii/spacing already
      // do — see the "Per-skin type scale" comment there.
      fontSize: {
        "display-lg": [
          "var(--text-display-lg)",
          {
            lineHeight: "var(--leading-display-lg)",
            letterSpacing: "var(--tracking-display-lg)",
            fontWeight: "var(--weight-display-lg)",
          },
        ],
        "headline-lg": [
          "var(--text-headline-lg)",
          {
            lineHeight: "var(--leading-headline-lg)",
            letterSpacing: "var(--tracking-headline-lg)",
            fontWeight: "var(--weight-headline-lg)",
          },
        ],
        "headline-lg-mobile": [
          "var(--text-headline-lg-mobile)",
          {
            lineHeight: "var(--leading-headline-lg-mobile)",
            letterSpacing: "var(--tracking-headline-lg-mobile)",
            fontWeight: "var(--weight-headline-lg-mobile)",
          },
        ],
        "headline-md": [
          "var(--text-headline-md)",
          {
            lineHeight: "var(--leading-headline-md)",
            letterSpacing: "var(--tracking-headline-md)",
            fontWeight: "var(--weight-headline-md)",
          },
        ],
        "headline-sm": [
          "var(--text-headline-sm)",
          {
            lineHeight: "var(--leading-headline-sm)",
            letterSpacing: "var(--tracking-headline-sm)",
            fontWeight: "var(--weight-headline-sm)",
          },
        ],
        "title-md": [
          "var(--text-title-md)",
          {
            lineHeight: "var(--leading-title-md)",
            letterSpacing: "var(--tracking-title-md)",
            fontWeight: "var(--weight-title-md)",
          },
        ],
        "body-lg": [
          "var(--text-body-lg)",
          {
            lineHeight: "var(--leading-body-lg)",
            letterSpacing: "var(--tracking-body-lg)",
            fontWeight: "var(--weight-body-lg)",
          },
        ],
        "body-md": [
          "var(--text-body-md)",
          {
            lineHeight: "var(--leading-body-md)",
            letterSpacing: "var(--tracking-body-md)",
            fontWeight: "var(--weight-body-md)",
          },
        ],
        "label-md": [
          "var(--text-label-md)",
          {
            lineHeight: "var(--leading-label-md)",
            letterSpacing: "var(--tracking-label-md)",
            fontWeight: "var(--weight-label-md)",
          },
        ],
        "label-sm": [
          "var(--text-label-sm)",
          {
            lineHeight: "var(--leading-label-sm)",
            letterSpacing: "var(--tracking-label-sm)",
            fontWeight: "var(--weight-label-sm)",
          },
        ],
        "micro-meta": [
          "var(--text-micro-meta)",
          {
            lineHeight: "var(--leading-micro-meta)",
            letterSpacing: "var(--tracking-micro-meta)",
            fontWeight: "var(--weight-micro-meta)",
          },
        ],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-default)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "9999px",
      },
      spacing: {
        base: "var(--space-base)",
        "container-padding": "var(--space-container-padding)",
        "element-gap": "var(--space-element-gap)",
        "section-margin": "var(--space-section-margin)",
        "grid-gutter": "var(--space-grid-gutter)",
      },
    },
  },
  plugins: [],
} satisfies Config;
