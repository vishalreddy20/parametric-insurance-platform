---
name: Parametric Income Protection
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#434655'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#555f6d'
  on-secondary: '#ffffff'
  secondary-container: '#d6e0f1'
  on-secondary-container: '#596372'
  tertiary: '#7f2500'
  on-tertiary: '#ffffff'
  tertiary-container: '#a73400'
  on-tertiary-container: '#ffc9b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#d9e3f4'
  secondary-fixed-dim: '#bdc7d8'
  on-secondary-fixed: '#121c28'
  on-secondary-fixed-variant: '#3e4755'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832700'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  mono-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for a parametric income protection platform serving Indian enterprises, gig platforms, and independent workers. The brand posture balances the regulatory precision of institutional finance with the rapid, telemetry-driven certainty of parametric insurance. The user interface must evoke complete trust, operational sobriety, and algorithmic clarity—especially during catastrophic claim-triggering weather, health, or economic events.

The visual direction uses a restrained, high-density Corporate / Modern aesthetic. There are no ornamental gradients, blurred glass overlays, decorative background blobs, or informal emoji treatments. Layouts prioritize scannability, deterministic visual hierarchy, and immediate data comprehension. High-contrast typography and utilitarian structure emphasize transparency: policies, automated triggers, real-time sensor verification, and instant payout rails via India Stack (UPI/IMPS) appear with institutional authority.

## Colors

The palette establishes sharp operational legibility under both harsh outdoor sunlight and dense workspace terminal setups. The canvas foundation uses `#F3F4F6` in light mode and `#111827` in dark mode, maintaining crisp contrast against elevated `#FFFFFF` and `#1F2937` surface containers.

### Core Roles
- **Primary Accent:** `#1D4ED8` (Light) / `#93C5FD` (Dark) with respective contrasting foregrounds `#FFFFFF` and `#111827`. Used strictly for interactive triggers, primary state verification, active navigation anchors, and focal data indicators.
- **Surface & Canvas:** Base canvas `#F3F4F6` (`#111827` dark) host layered flat panels at `#FFFFFF` (`#1F2937` dark).
- **Text & Contrast:** Base high-contrast copy sits at `#111827` (`#F9FAFB` dark), with secondary structural metadata at `#4B5563` (`#D1D5DB` dark).
- **Structural Lines:** Deliberately bifurcated between structural framing and form boundaries. Structural dividers, card edges, and table rules utilize `#D1D5DB` (`#374151` dark). Interactive form control borders enforce a prominent `#6B7280` (`#9CA3AF` dark) for accessibility and clarity in variable field environments.

### Parametric Feedback Roles
- **Success:** `#166534` for validated triggers, funded disbursements, and operational policy coverage.
- **Warning:** `#92400E` for pending threshold approaches, ambient telemetry drift, and impending policy renewals.
- **Danger:** `#991B1B` for trigger breach limits, failed API integrations, and disputed index criteria.
- **Info:** `#1E40AF` for index updates, meteorological notices, and scheduled recalculations.

## Typography

The typographic hierarchy utilizes a singular, strictly calibrated implementation of `Inter` across all structural levels. It guarantees immediate optical alignment across high-density parametric financial dashboards, tabular claims tables, and policy forms.

### Numerical & Regional Conventions
- **Tabular Figures:** All dynamic figures, policy IDs, currency amounts, sensor thresholds, coordinates, and percentage indicators must enforce open-type tabular numbers (`font-variant-numeric: tabular-nums`).
- **Indian Rupee Formatting:** Financial metrics must prefix the official Rupee symbol (`₹`) with a standard non-breaking space before the numerical value. Values follow the Indian numbering system notation (e.g., `₹ 1,50,000.00` and `₹ 12,40,00,000`).
- **Timestamps:** Because trigger evaluations rely on immutable time stamps, all dates and times must state the Indian Standard Time zone explicitly: `DD MMM YYYY, HH:mm:ss IST` (e.g., `14 Oct 2024, 18:32:05 IST`).

## Layout & Spacing

The layout philosophy adheres to a strict 4px/8px mathematical rhythm anchored within a 12-column responsive fluid grid. Total page containers never exceed a maximum structural constraint of 1200px, centering analytical density and preventing eye fatigue across widescreen displays.

### Responsive Breakpoints & Reflow
- **Desktop (≥ 1024px):** 12-column grid, `margin-desktop` (2rem / 32px), `gutter-desktop` (1.5rem / 24px). High-density split layouts place trigger criteria side-by-side with historical telemetry graphs.
- **Tablet (768px – 1023px):** 8-column layout, `margin` (1.5rem / 24px), `gutter` (1rem / 16px). Secondary telemetry stacks below contract summaries.
- **Mobile (≤ 767px):** 4-column layout, `margin` (1rem / 16px), `gutter` (1rem / 16px). Grids collapse to single-column flows; tables gain horizontal scrolling with pinned index columns.

All spacing tokens govern internal cell buffers and element separation exclusively. Dimensional padding uses `space-xs` (4px) and `space-sm` (8px) for tightly grouped tabular indicators, scaling up to `space-md` (16px) and `space-lg` (24px) for card body containment.

## Elevation & Depth

This design system rejects ambient layered shadows, heavy directional blurs, and glassmorphic translucent effects. Depth is communicated almost exclusively through flat tonal layering and 1px crisp structural rules.

### Layering Hierarchy
- **Base Canvas:** The foundational background (`#F3F4F6` light / `#111827` dark) hosts all subordinate workspaces.
- **Surface Plane:** Cards, data tables, and structural wrappers occupy `#FFFFFF` (`#1F2937` dark) with a continuous 1px solid border defined by the divider color (`#D1D5DB` light / `#374151` dark).
- **Floating Overlays & Menus:** Popovers, action menus, and modal dialogs use the surface background paired with a razor-thin, minimal resting shadow to separate the element from the viewport: `0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)`. In dark mode, this is achieved by increasing the border prominence rather than casting shadows.

## Shapes

The design system employs a disciplined, micro-radius shape architecture. UI elements avoid soft pill shapes or stark brutalist edges, adhering to a uniform `4px` (`0.25rem`) standard corner radius (`roundedness: 1`).

- **Base Elements (Buttons, Inputs, Selectors, Badges):** Standardized to 4px.
- **Card Containers & Modal Shells:** Standardized to 4px with crisp 1px perimeter outlines.
- **Nested Inner Modules (e.g., cell highlights inside tables, status badges):** Retain a strict 2px to 4px geometry, ensuring nested radii harmonize mathematically with enclosing cards without creating organic, rounded visuals.

## Components

### Buttons
- **Primary:** Background `#1D4ED8` (`#93C5FD` in dark), text `#FFFFFF` (`#111827` in dark), 4px radius, 0px border. Hover transitions strictly shift lightness by 8% without scale or bounce animations. Focus ring is an explicit 2px outline separated by 2px offset.
- **Secondary / Outline:** Background transparent, text `#111827` (`#F9FAFB` in dark), border 1px solid `#6B7280` (`#9CA3AF` in dark).
- **Subtle / Ghost:** Background transparent, text `#4B5563` (`#D1D5DB` in dark), no border. Hover applies canvas-level tint.
- **Height & Padding:** 36px default height (dense operational standard), horizontal padding `12px` (`space-md` minus 4px).

### Input Fields & Form Controls
- **Text Inputs & Dropdowns:** 36px height, surface background, 1px solid `#6B7280` (`#9CA3AF` in dark) border, 4px corner radius. Typographic weight set to 400 with 14px size. Placeholder text rendered in `#4B5563` at 50% opacity.
- **Focus State:** 1px border swaps to `#1D4ED8` with a 1px matching ring; zero glowing shadow spread.
- **Checkboxes & Radios:** 16px square/circle with 1px solid `#6B7280`. Checked state fills `#1D4ED8` with a white mathematical checkmark or centered dot.

### Chips & Parametric Status Indicators
- **Form Factor:** Compact 20px or 24px height, horizontal padding `6px` or `8px`, 4px corner radius, font size 12px with 500 font-weight.
- **Trigger Met / Active Payout:** Light green tint background (`#DCFCE7`), text `#166534`, 1px solid `#BBF7D0`.
- **Under Monitoring / Warning:** Light amber tint background (`#FEF3C7`), text `#92400E`, 1px solid `#FDE68A`.
- **Critical Breach:** Light red tint background (`#FEE2E2`), text `#991B1B`, 1px solid `#FECACA`.
- **Information / Telemetry Feed:** Light blue tint background (`#DBEAFE`), text `#1E40AF`, 1px solid `#BFDBFE`.

### Data Cards & Parametric Triggers
- **Construction:** Surface background (`#FFFFFF` / `#1F2937`), enclosed by a 1px solid `#D1D5DB` (`#374151` dark) rule. 4px corner radius.
- **Card Header:** Separated from the body via a continuous 1px solid bottom divider rule. Headline 14px or 16px medium weight, paired with right-aligned status chip and tabular parameter tracking.
- **Parametric Trigger Gauge:** A flat linear progress track (4px height, background `#E5E7EB`) overlaid with a solid operational color indicator marking the contract trigger threshold.

### Tables & Dense Lists
- **Structure:** Flat table format, zero outer border, header row with subtle `#F3F4F6` background and 1px bottom divider `#D1D5DB`.
- **Row Styling:** Single-pixel horizontal rules (`#D1D5DB`), alternating row striping avoided in favor of subtle hover fills. Vertical cell padding constrained to 8px top/bottom for information density.
- **Data Cells:** Left-aligned text, right-aligned currency (in `₹`) and numbers, center-aligned dates and times with tabular figures enforced.