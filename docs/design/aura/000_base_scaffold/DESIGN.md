---
name: Haven Aura
colors:
  surface: '#f8faf9'
  surface-dim: '#d8dada'
  surface-bright: '#f8faf9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f3'
  surface-container: '#eceeed'
  surface-container-high: '#e6e9e8'
  surface-container-highest: '#e1e3e2'
  on-surface: '#191c1c'
  on-surface-variant: '#434845'
  inverse-surface: '#2e3131'
  inverse-on-surface: '#eff1f0'
  outline: '#747875'
  outline-variant: '#c4c7c4'
  surface-tint: '#5b5f5d'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#181c1a'
  on-primary-container: '#818582'
  inverse-primary: '#c4c7c4'
  secondary: '#55615d'
  on-secondary: '#ffffff'
  secondary-container: '#d8e5e0'
  on-secondary-container: '#5b6763'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#022018'
  on-tertiary-container: '#6b8a7e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e0e3e0'
  primary-fixed-dim: '#c4c7c4'
  on-primary-fixed: '#181c1a'
  on-primary-fixed-variant: '#444845'
  secondary-fixed: '#d8e5e0'
  secondary-fixed-dim: '#bcc9c5'
  on-secondary-fixed: '#121e1b'
  on-secondary-fixed-variant: '#3d4946'
  tertiary-fixed: '#c9eadc'
  tertiary-fixed-dim: '#adcec0'
  on-tertiary-fixed: '#022018'
  on-tertiary-fixed-variant: '#2f4c42'
  background: '#f8faf9'
  on-background: '#191c1c'
  surface-variant: '#e1e3e2'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.03em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  micro-meta:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style
The design system is crafted for high-trust, emotionally complex environments such as co-parenting coordination. The brand voice is calm, objective, supportive, and restorative. It actively counters stress, friction, and anxiety through serene visual space, tactile softness, and unhurried clarity.

The visual style merges soft organic minimalism with modern neo-grotesque precision. Deeply informed by aerated editorial card layouts, the aesthetic relies on porcelain canvases, gentle sage-tinted mint card containers, grounded obsidian touches, and generous squircle architecture. The UI feels like a warm, organized sanctuary where communication and schedules are mediated without emotional heat.

## Colors
The color foundation is built to soothe the central nervous system:
- **Neutral Canvas (`#F6F8F7`)**: An ultra-soft porcelain off-white with faint green-gray warmth, avoiding the eye-strain of harsh pure white.
- **Card Mint / Haven Mist (`#E2EFEA`, `#E5EFEA`)**: An airy, sage-tinted tint used for primary information islands, custody blocks, and focal scheduling zones.
- **Pure White (`#FFFFFF`)**: Reserved exclusively for floating layered cards, elevated search bars, active segmented toggle pills, and icon disc backgrounds to create gentle dimensional lift.
- **Obsidian Anchor (`#161A18`, `#1E2322`)**: Dense, softened charcoal-black used for bottom navigation capsules, primary action points, strong typography, and contrast pins.
- **Supportive Accent Sage (`#8FAFA2`)**: Muted botanical tone for subtle icons, active status indicators, badge fills, and calm trajectory traces.
- **Subtle Surface Hairlines (`rgba(22, 26, 24, 0.04)`)**: Faint borders that provide structure without visual clutter.

## Typography
Plus Jakarta Sans serves as the singular typeface across all hierarchies. Its rounded humanist neo-grotesque apertures evoke empathy and warmth, while its precise geometry preserves authority and clarity.

Typographic hierarchy utilizes pronounced contrast between expressive, grounded headlines and delicate, wide-tracked micro-labels. Display headers are set tight and confident with negative tracking (`-0.02em` to `-0.03em`). Metadata, airport-style custody route codes, and status markers are tracked out (`0.04em` to `0.08em`) in upper or small-caps styles to establish rapid visual scanning without visual weight.

## Layout & Spacing
The layout strategy prioritizes breathable negative space, avoiding cognitive overload. On mobile devices, views adhere to a standardized 1.25rem (20px) horizontal gutter and edge padding, with card gaps configured at 1rem (16px) to maintain rhythm.

Vertical cadence is generous: sections are separated by `space-xl` (36px), allowing independent scheduling events, custody handovers, or shared expenses to live as distinct cognitive chapters. Floating interface anchors (such as floating nav docks and action bubbles) rest comfortably above the home indicator with `space-lg` bottom clearance.

## Elevation & Depth
Depth is created through soft chromatic layering rather than traditional drop shadows. 

- **Tier 0 (Base Canvas)**: Porcelain `#F6F8F7`.
- **Tier 1 (Surface Containers)**: Soft Sage `#E2EFEA` or Crisp White `#FFFFFF` with ultra-fine boundaries (`1px solid rgba(22, 26, 24, 0.04)`).
- **Tier 2 (Floating Controls & Segment Controls)**: Pure white `#FFFFFF` or elevated mint floating across layers with ambient dispersion: `0px 8px 24px -4px rgba(22, 26, 24, 0.04)`.
- **Tier 3 (Floating Docks & Pills)**: Obsidian black `#161A18` pill dock resting above content with deep, muted grounding: `0px 12px 32px -6px rgba(22, 26, 24, 0.18)`.

## Shapes
Forms throughout the design system use gentle organic geometry:
- **Card Containers**: Large, continuous squircles configured between `24px` and `32px` (`rounded-3xl`).
- **Pills & Navigation Shells**: Complete organic capsules (`rounded-full` / 9999px) for pill buttons, segmented switchers, and icon housings.
- **Nested Inner Surfaces**: Nested cards and photo vignettes mirror outer curvature at proportional radii (`16px` to `20px`), ensuring visual harmony.

## Components

### Buttons & Interactive Controls
- **Primary Floating Dock**: A pill-shaped obsidian container (`#161A18`) featuring circular utility icon buttons (`#FFFFFF` on `#2B312E` active states).
- **Action Pills**: Soft rounded buttons available in porcelain `#FFFFFF` with micro-borders or mint `#E2EFEA`, utilizing `title-md` or `label-md` typography.
- **Circular Icon Triggers**: 48x48px circular buttons rendered in pure white or faint tint `#E2EFEA` with centered 20px monochrome line icons.

### Segmented Switchers
- Floating full-radius pill pods containing two or three tabs.
- Active item uses elevated white fill (`#FFFFFF`) with subtle ambient shadow (`0px 2px 8px rgba(0, 0, 0, 0.04)`) and dark text (`#161A18`). Inactive items rest flat with muted slate typography (`#75827D`).

### Cards & Schedules
- **Mint Schedule Cards**: Large `rounded-[28px]` surfaces coated in `#E2EFEA`. Top header groups the date, transfer times, and custody status badges. Split trajectory routes mimic minimal travel boards with soft dotted connectors and departure/destination squircle nodes.
- **Interactive Image Cards**: Deep squircle cards (`rounded-[32px]`) housing full-bleed imagery with a floating rating or time badge in the top-right corner and an embedded obsidian circular diagonal arrow button in the bottom-right corner.

### Form Inputs & Search Fields
- Fully rounded (`rounded-full`) pure white bars (`#FFFFFF`) framed by a faint boundary (`1px solid rgba(22, 26, 24, 0.05)`).
- Left-aligned search icon, centered placeholder in muted gray-green, and contextual secondary action buttons (such as filter badges).

### Badges & Notification Indicators
- Floating pill badges using solid white with soft drop shadows or semi-transparent mint fills.
- Unread states use soft sage dots (`#8FAFA2`) nested on the upper-right shoulder of notification triggers.